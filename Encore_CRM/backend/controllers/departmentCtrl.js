const mongoose = require('mongoose');
const Department = require('../models/departmentModel');
const Racking = require('../models/rackingModel');
const { logError } = require('../logger');

exports.addDepartmentData = async (req, res) => {
    try {
        const departmentData = req.body;
        const existingDept = await Department.findOne({department_name: departmentData.department_name});
        if (existingDept) {
            const err = new Error("Department Name Already Exists");
            logError('addDepartmentData', err, req.user.user_ref_id);
            return res.status(500).send("Department name already exists.");
        }
        const departmentCount = await Department.countDocuments();
        departmentData.department_order = departmentCount + 1;
        let departmentDataInfo = await Department.create(departmentData);
        res.status(200).send(departmentDataInfo);
    } catch (err) {
        logError('addDepartmentData', err, req.user.user_ref_id);
        res.status(500).send("Data Adding Failed.");
    }
};

exports.fetchDepartmentData = async (req,res) => {
    try{
        let params = req.query.tabs;
        let departmentDetails;
        if(params){
            departmentDetails = await Department.find({department_tab_visibility: params}).sort({ department_order : 1});
        }else{
            departmentDetails = await Department.find().sort({ department_order: 1 });
        }
        res.status(200).send(departmentDetails);
    }
    catch(err){
        logError('fetchDepartmentData', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.fetchSpecificDepartmentData = async (req,res) => {
    try{
        let department_Id = req.params.id;
        let departmentDetails = await Department.find({_id: department_Id});
        res.status(200).send(departmentDetails);
    }
    catch(err){
        logError('fetchSpecificDepartmentData', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.updateSpecificDepartmentData = async(req, res) =>{
    try{
        let department_Id = req.params.id;
        const department_Data = req.body;        
        department_Data.updated = new Date().toISOString();
        let departmentInfo = await Department.findByIdAndUpdate(department_Id, department_Data);
        res.status(200).send(departmentInfo);
        res.end();
    }
    catch(err){ 
        logError('updateSpecificDepartmentData', err, req.user.user_ref_id); 
        res.status(500).send("Data Updation Failed.");
    } 
}

exports.addRackingData = async (req, res) => {
    try {
        const rackingData = req.body;
        const existingRack = await Racking.findOne({rack_name: rackingData.rack_name});
        if (existingRack) {
            const err = new Error("Rack Name Already Exists");
            logError('addRackingData', err, req.user.user_ref_id);
            return res.status(500).send("Rack name already exists.");
        }
        let rackingDataInfo = await Racking.create(rackingData);
        res.status(200).send(rackingDataInfo);
    } catch (err) {
        logError('addRackingData', err, req.user.user_ref_id);
        res.status(500).send("Data Adding Failed");
    }
};

exports.fetchRackingDataDropdown = async (req,res) => {
    try{
        let rackingData = await Racking.find().sort({ rack_order : 1});
        res.send(rackingData).status(200).end();
    }
    catch(err){
        logError('fetchRackingDataDropdown', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
}

exports.fetchRackingData = async (req, res) => {
    try {
       
        const limit = 30;
        const page = req.query.page || 0;
        const skip = page * limit;
        const searchKeyword = req.query.query;
        const searchFilter = {};
        if (searchKeyword) {
            searchFilter.$or = [
                { rack_name: { $regex: searchKeyword, $options: "i" } },
                { rack_code: { $regex: searchKeyword, $options: "i" } },
                { rack_status: { $regex: searchKeyword, $options: "i" } },
            ];
        }
  
        const total_racks = await Racking.find({
            ...searchFilter,
        });
        let total_racks_count = total_racks.length;
        let rackDetails = await Racking.aggregate([
            {
                $match: {
                    ...searchFilter,
                },
            },
            { $sort: { rack_order: 1 } },
            {
                $project: {
                    _id: 1,
                    rack_name: 1,
                    rack_code: 1,
                    rack_status: 1,
                    created: 1,
                }
            }
        ]).skip(skip) .limit(limit);
        const pages = Math.ceil(total_racks_count / limit);
        const fullObj = {
            totalItems: total_racks_count,
            fetchedItems: rackDetails,
            rowsPerPage: limit,
            totalPages: pages,
        };
        res.status(200).send(fullObj);
    }
    catch (err) { 
        logError('fetchRackingData', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed");
    }
}

exports.fetchSpecificRackingData = async (req,res) => {
    try{
        let racking_Id = new mongoose.Types.ObjectId(req.params.id);
        let rackingData = await Racking.find({_id: racking_Id});
        res.send(rackingData).status(200).end();
    }
    catch(err){
        logError('fetchSpecificRackingData', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
}

exports.updateSpecificRackingData = async (req, res) => {
    try {
        const racking_Id = req.params.id;
        const rackingData = req.body;
        rackingData.updated = new Date().toISOString();
        if (rackingData.rack_name) {
            const existingRack = await Racking.findOne({
                rack_name: rackingData.rack_name,
                _id: { $ne: racking_Id }
            });
            if (existingRack) {
                const err = new Error("Rack Name Already Exists");
                logError('updateSpecificRackingData', err, req.user.user_ref_id);
                return res.status(500).send("Rack name already exists");
            }
        }
        const rackingDataInfo = await Racking.findByIdAndUpdate(racking_Id, rackingData, { new: true });
        res.status(200).send(rackingDataInfo);
    } catch (err) {
        logError('updateSpecificRackingData', err, req.user.user_ref_id);
        res.status(500).send("Data Updation Failed");
    }
};

