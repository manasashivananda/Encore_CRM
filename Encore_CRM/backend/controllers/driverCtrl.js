const DriverModel = require('../models/driverMasterModel');
const mongoose = require('mongoose');
const { handleMongooseError } = require('./common');
const { logError } = require("../logger");

const getDriverList = async (req, res) => {
    try {
        let { page = 0, limit = 10, search_text, status = "active" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const skip = page * limit;

        // Build filter object
        const filter = { status: status};
        if (search_text) {
            filter.$or = [
                { name: { $regex: search_text, $options: 'i' } },
                { phone: { $regex: search_text, $options: 'i' } },
                { email: { $regex: search_text, $options: 'i' } },
                { work_location: { $regex: search_text, $options: 'i' } }
            ];
        }

        const drivers = await DriverModel.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ created_date: -1 });

        const totalDrivers = await DriverModel.countDocuments(filter);

        res.status(200).json({
            status: true,
            message: 'Driver list fetched successfully',
            data: drivers,
            total: totalDrivers,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error) {
        logError('getDriverList', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const getDriverById = async (req, res) => {
    try {
        const { id } = req.params;
        const driver = await DriverModel.findById(id);

        if (!driver) {
            return res.status(404).json({
                status: false,
                message: 'Driver not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Driver fetched successfully',
            data: driver,
        });
    } catch (error) {
        logError('getDriverById', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const createDriver = async (req, res) => {
    try {
        const { name, phone, email, work_location, driver_type, address, onWork } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        const newDriver = new DriverModel({
            name,
            phone,
            email,
            work_location,
            driver_type,
            address,
            onWork,
            created_by: userId,
            created_date: Date.now()
        });

        await newDriver.validate(); // Validate the new driver before saving
        await newDriver.save();

        res.status(201).json({
            status: true,
            message: 'Driver created successfully',
            data: newDriver,
        });
    } catch (error) {
        logError('createDriver', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const updateDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, work_location, driver_type, address, status, onWork } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);
        const updatedDriver = await DriverModel.findByIdAndUpdate(id, {
            name,
            phone,
            email,
            work_location,
            driver_type,
            address,
            status,
            onWork,
            updated_by: userId,
            updated_date: Date.now(),
        }, { new: true });

        if (!updatedDriver) {
            return res.status(404).json({
                status: false,
                message: 'Driver not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Driver updated successfully',
            data: updatedDriver,
        });
    } catch (error) {
        logError('updateDriver', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const deleteDriver = async (req, res) => {
    try {
        let Id = new mongoose.Types.ObjectId(req.params.id);
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        const deletedDriver = await DriverModel.findByIdAndUpdate(Id, { 
            status: 'inactive',
            updated_by: userId,
            updated_date: Date.now()
        }, { new: true });

        if (!deletedDriver) {
            return res.status(404).json({
                status: false,
                message: 'Driver not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Driver deleted successfully',
            data: deletedDriver,
        });
    } catch (error) {
        logError('deleteDriver', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const updateOnWork = async (req, res) => {
    try {
        let Id = new mongoose.Types.ObjectId(req.params.id);
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        const deletedDriver = await DriverModel.findByIdAndUpdate(Id, { 
            onWork: req.onWork,
            updated_by: userId,
            updated_date: Date.now()
        }, { new: true });

        if (!deletedDriver) {
            return res.status(404).json({
                status: false,
                message: 'Driver not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Driver record updated successfully',
            data: deletedDriver,
        });
    } catch (error) {
        logError('updateOnWork', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const fetchActiveDrivers = async (req, res) => {
    try {
        const drivers = await DriverModel.aggregate([
            {
                $lookup: {
                    from: 'trucks', // collection name in MongoDB
                    localField: '_id',
                    foreignField: 'default_driver_id',
                    as: 'default_truck'
                }
            },
            {
                $unwind: {
                    path: '$default_truck',
                    preserveNullAndEmptyArrays: true // ensures drivers with no truck are included
                }
            },
            {
                $match: {
                    onWork: true
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    truck_name: '$default_truck.name'
                }
            },
            {
                $sort: {
                    created_date: -1
                }
            }
        ]);

        res.status(200).json({
            status: true,
            message: 'Active drivers fetched successfully',
            data: drivers,
        });
    } catch (error) {
        logError('fetchActiveDrivers', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
};


module.exports = {
    getDriverList,
    getDriverById,
    createDriver,
    updateDriver,
    deleteDriver,
    fetchActiveDrivers,
    updateOnWork
}