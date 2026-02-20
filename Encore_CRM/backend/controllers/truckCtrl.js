const TruckModel = require('../models/truckMasterModel');
const TruckMaintainanceModel = require('../models/truckMasterMaintainanceModel');

const { handleMongooseError } = require('./common');
const { default: mongoose } = require('mongoose');
const { logError } = require('../logger');

const getTruckList = async (req, res) => {
    try {
        let { page = 0, limit = 10, search_text, status = "active" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const skip = page * limit;

        // Build filter object
        const filter = {status: status};
        if (search_text) {
            filter.$or = [
                { name: { $regex: search_text, $options: 'i' } },
                { reg_no: { $regex: search_text, $options: 'i' } }
            ];
        }

        const pipline = [
            {
                $lookup: {
                    from: 'drivers',
                    let: { driverId: "$default_driver_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$driverId"] } } },
                        { $project: { _id: 1, name: 1 } }
                    ],
                    as: 'default_driver'
                }
            },
            {
                $unwind: {
                    path: '$default_driver',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    name: 1,
                    reg_no: 1,
                    location: 1,
                    dimensions: 1,
                    type: 1,
                    driver_info: '$default_driver',
                    status: 1,
                    created_date: 1,
                    updated_date: 1
                }
            },
            {
                $sort: { created_date: -1 }
            }
        ];
        const trucks = await TruckModel.aggregate(pipline)
            .match(filter)
            .skip(skip)
            .limit(limit)
            .sort({ created_date: -1 });

        const totalTrucks = await TruckModel.countDocuments(filter);

        res.status(200).json({
            status: true,
            message: 'Truck list fetched successfully',
            data: trucks,
            total: totalTrucks,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error) {
        logError("getTruckList", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const getTruckById = async (req, res) => {
    try {
        const { id } = req.params;
        const truck = await TruckModel.findById(id);

        if (!truck) {
            return res.status(404).json({
                status: false,
                message: 'Truck not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Truck fetched successfully',
            data: truck,
        });
    } catch (error) {
        logError("getTruckById", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}
const createTruck = async (req, res) => {
    try {
        const { name, reg_no, driver_id, location, dimensions, type, created_by } = req.body;

        const newTruck = new TruckModel({
            name,
            reg_no,
            default_driver_id: driver_id,
            location,
            dimensions,
            type,
            created_by: created_by,
            created_date: Date.now()
        });

        await newTruck.save();

        res.status(201).json({
            status: true,
            message: 'Truck created successfully'
        });
    } catch (error) {
        logError("createTruck", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const updateTruck = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, reg_no, driver_id, location, dimensions, type, updated_by, status } = req.body;

        const updatedTruck = await TruckModel.findByIdAndUpdate(id, {
            name,
            reg_no,
            default_driver_id: driver_id,
            location,
            dimensions,
            type,
            updated_by,
            updated_date: Date.now(),
            status
        }, { new: true });

        if (!updatedTruck) {
            return res.status(404).json({
                status: false,
                message: 'Truck not found'
            });
        }


        res.status(200).json({
            status: true,
            message: 'Truck updated successfully'
        });
    } catch (error) {
        logError("updateTruck", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}
const deleteTruck = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTruck = await TruckModel.findByIdAndUpdate(id, { status: 'inactive', updated_date: Date.now() }, { new: true });

        if (!deletedTruck) {
            return res.status(404).json({
                status: false,
                message: 'Truck not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Truck deleted successfully',
            data: deletedTruck,
        });
    } catch (error) {
        logError("deleteTruck", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const fetchActiveTrucks = async (req, res) => {
    try {
        const trucks = await TruckModel.find({ status: 'active' })
            .select('name reg_no dimensions')
            .sort({ created_date: -1 });

        res.status(200).json({
            status: true,
            message: 'Active trucks fetched successfully',
            data: trucks,
        });
    } catch (error) {
        logError("fetchActiveTrucks", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const logTruckMaintanance = async (req, res) =>{
    try {
        const data = req.body
        data.created_by = req.user.user_ref_id
        const truckMaintainance = new TruckMaintainanceModel(req.body);

        await truckMaintainance.validate(); // Validate the new driver before saving
        await truckMaintainance.save();

        res.status(201).json({
            status: true,
            message: 'Truck maintainance logged successfully'
        });
    } catch (error) {
        logError("logTruckMaintanance", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}


const getTruckLogMaintainanceByTruckId = async (req, res) =>{
    try {
        const { id } = req.params;
        console.log(id)

        const truckInfo = await TruckModel.findById(id)

        const filter = {
            truck_id: new mongoose.Types.ObjectId(id)       
        };

        const pipline = [
            {$match : filter},
            {
                $lookup: {
                    from: 'trucks',
                    let: { truckId: "$truck_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$truckId"] } } },
                        { $project: { _id: 1, name: 1, reg_no: 1, type: 1, status: 1  } }
                    ],
                    as: 'truck'
                }
            },
            {
                $unwind: {
                    path: '$truck',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    from_date: 1,
                    to_date: 1,
                    description: 1,
                    amt: 1,
                    truck_info: '$truck',
                }
            },
            {
                $sort: { created_date: -1 }
            }
        ];

        const truckLog = await TruckMaintainanceModel.aggregate(pipline)

        res.status(200).json({
            status: true,
            message: 'Truck Log fetched successfully',
            data: truckLog,
            truckInfo
        });
    } catch (error) {
        logError("getTruckLogMaintainanceByTruckId", error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}



module.exports = {
    getTruckList,
    getTruckById,
    createTruck,
    updateTruck,
    deleteTruck,
    fetchActiveTrucks,
    logTruckMaintanance,
    getTruckLogMaintainanceByTruckId
}

