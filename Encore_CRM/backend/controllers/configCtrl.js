const ConfigModel = require('../models/configModel');
const mongoose = require('mongoose');
const { handleMongooseError } = require('./common');
const { logError } = require('../logger');

const getConfigList = async (req, res) => {
    try {
        let { page = 0, limit = 10, search_text } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const skip = page * limit;

        // Build filter object
        const filter = {};
        if (search_text) {
            filter.$or = [
                { name: { $regex: search_text, $options: 'i' } },
            ];
        }

        const configs = await ConfigModel.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ created_date: -1 });

        const totalConfigs = await ConfigModel.countDocuments(filter);

        res.status(200).json({
            status: true,
            message: 'Config list fetched successfully',
            data: configs,
            total: totalConfigs,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error) {
        logError('getConfigList', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const getConfigById = async (req, res) => {
    try {
        const { id } = req.params;
        const config = await ConfigModel.findById(id);

        if (!config) {
            return res.status(404).json({
                status: false,
                message: 'Config data not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Config data fetched successfully',
            data: config,
        });
    } catch (error) {
        logError('getConfigById', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const createConfig = async (req, res) => {
    try {
        const { name, lat, lon, allowed_radius, region } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        const newConfig = new ConfigModel({
            name,
            lat,
            lon,
            allowed_radius,
            region,
            created_by: userId,
            created_date: Date.now()
        });

        await newConfig.validate(); // Validate the new driver before saving
        await newConfig.save();

        res.status(201).json({
            status: true,
            message: 'Config created successfully',
            data: newConfig,
        });
    } catch (error) {
        logError('createConfig', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const updateConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, lat, lon, allowed_radius, region, status } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);
        const updatedConfig = await ConfigModel.findByIdAndUpdate(id, {
            name,
            lat,
            lon,
            allowed_radius,
            region,
            status,
            updated_by: userId,
            updated_date: Date.now(),
        }, { new: true });

        if (!updatedConfig) {
            return res.status(404).json({
                status: false,
                message: 'Config not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Config updated successfully',
            data: updatedConfig,
        });
    } catch (error) {
        logError('updateConfig', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const deleteConfig = async (req, res) => {
    try {
        let Id = new mongoose.Types.ObjectId(req.params.id);
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        const deletedConfig = await ConfigModel.findByIdAndUpdate(Id, { 
            status: 'inactive',
            updated_by: userId,
            updated_date: Date.now()
        }, { new: true });

        if (!deletedConfig) {
            return res.status(404).json({
                status: false,
                message: 'Config not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Config deleted successfully',
            data: deletedConfig,
        });
    } catch (error) {
        logError('deleteConfig', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}



module.exports = {
    getConfigList,
    getConfigById,
    createConfig,
    updateConfig,
    deleteConfig
}