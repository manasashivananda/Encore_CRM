const MessageModel = require("../models/messagesModel");
const mongoose = require('mongoose');
const { getIO } = require('../socket');
const { logError } = require("../logger");

const postMessage = async (req, res) => {
  const { text, depts } = req.body;
  try {
    const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

    const msg = await MessageModel.create({
      text,
      depts,
      created_by: userId,
      created_date: Date.now(),
      status: 'pending'
    });

    // Look up username and concatenate first + last name
    const [result] = await MessageModel.aggregate([
      { $match: { _id: msg._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $addFields: {
          createdByName: {
            $concat: [
              '$userInfo.user_firstName', ' ',
              '$userInfo.user_lastName'
            ]
          }
        }
      },
      {
        $project: {
          text: 1,
          depts: 1,
          status: 1,
          created_date: 1,
          updated_date: 1,
          createdByName: 1
        }
      }
    ]);

    const io = getIO();
    io.to('coordinator').to(...depts).emit('message_new', result);

    res.status(201).json({ msg: result });
  } catch (err) {
    logError('postMessageError', err);
  }
};

const postSystemMessage = async (user_id, text, depts = []) =>{
  try {
    const userId = new mongoose.Types.ObjectId(user_id);
    if(depts.length === 0)
      return
    const msg = await MessageModel.create({
      text,
      depts,
      created_by: userId,
      created_date: Date.now(),
      status: 'pending'
    });

    // Look up username and concatenate first + last name
    const [result] = await MessageModel.aggregate([
      { $match: { _id: msg._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $addFields: {
          createdByName: {
            $concat: [
              '$userInfo.user_firstName', ' ',
              '$userInfo.user_lastName'
            ]
          }
        }
      },
      {
        $project: {
          text: 1,
          depts: 1,
          status: 1,
          updated_date:1,
          created_date: 1,
          createdByName: 1
        }
      }
    ]);

    const io = getIO();
    io.to('coordinator').to(...depts).emit('message_new', result);
  } catch (err) {
    logError('postMessageError', err);
  }
}

const updateMessage = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);
    await MessageModel.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status, updated_by: userId, updated_date: Date.now() },
      { new: true }
    );

    // Aggregate for enriched message
    const [msg] = await MessageModel.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $lookup: {
          from: 'users',
          localField: 'updated_by',
          foreignField: '_id',
          as: 'upd'
        }
      },
      { $unwind: '$upd' },
      {
        $addFields: {
          updatedByName: { $concat: ['$upd.user_firstName', ' ', '$upd.user_lastName'] }
        }
      },
      {
        $project: {
          text: 1, depts: 1, status: 1, created_date: 1, updatedByName: 1, updated_date:1
        }
      }
    ]);

    const io = getIO();
    io.to('coordinator').emit('message_updated', msg);
    res.json(msg);
  } catch (err) {
    logError('updateMessageError', err);
  }
};


const getMessagesCo = async (req, res) => {
  try {
    const statuses = req.query.status
      ? req.query.status.split(',')
      : ['pending', 'not_possible'];

    const { user_type, depts: deptsParam } = req.query;
    const userDepts = deptsParam ? deptsParam.split(',') : [];

    // Build the base match filter
    const baseMatch = { status: { $in: statuses } };

    // If user_type is 'op' and dept filters are provided, add dept condition
    if (user_type === 'op' && userDepts.length) {
      baseMatch.depts = { $in: userDepts };
    }

    const msgs = await MessageModel.aggregate([
      { $match: baseMatch },

      // Lookups for creator/updater
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'updated_by',
          foreignField: '_id',
          as: 'updater'
        }
      },
      { $unwind: { path: '$updater', preserveNullAndEmptyArrays: true } },

      // Compute names and flags
      {
        $addFields: {
          createdByName: {
            $concat: ['$creator.user_firstName', ' ', '$creator.user_lastName']
          },
          updatedByName: {
            $cond: [
              { $ifNull: ['$updater', false] },
              {
                $concat: ['$updater.user_firstName', ' ', '$updater.user_lastName']
              },
              null
            ]
          },
          isNotPossible: { $cond: [{ $eq: ['$status', 'not_possible'] }, 1, 0] }
        }
      },

      // Compute dynamic sort key
      {
        $addFields: {
          sortKey: {
            $cond: [
              { $eq: ['$status', 'finished'] },
              '$updated_date',
              '$created_date'
            ]
          }
        }
      },

      // Project only required fields
      {
        $project: {
          text: 1,
          depts: 1,
          status: 1,
          created_date: 1,
          updated_date: 1,
          createdByName: 1,
          updatedByName: 1,
          isNotPossible: 1,
          sortKey: 1
        }
      },

      // Sort as before
      {
        $sort: {
          isNotPossible: -1,
          sortKey: -1
        }
      }
    ]);

    res.json(msgs);
  } catch (err) {
    logError('getMessageError', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};




module.exports = {
  postMessage,
  updateMessage,
  getMessagesCo,
  postSystemMessage
};
