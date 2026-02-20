const { default: mongoose } = require('mongoose');
const RunsDriversModel = require('../models/runsDriversModel');
const { handleMongooseError } = require('./common');
const { logError } = require("../logger");
const { assignDriversToRuns } = require('./runsDriversOrderCtrl');
const Drivers = require('../models/driverMasterModel');
const RunsDriversOrderModel = require('../models/runsDriversOrderModel');

const createDriversList = async (req, res) =>{
    try {
        const { delivery_date, drivers_id = [], run_type, draft_drivers } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        // Convert delivery_date to YYYY-MM-DD format
        const formattedDate = new Date(delivery_date).toISOString().split('T')[0];

        // Check if a record already exists for this date
        const existingRecord = await RunsDriversModel.findOne({ 
            delivery_date: new Date(formattedDate),
            run_type
        });

        if (existingRecord) {
            return res.status(209).json({
                status: false,
                message: 'A drivers list already exists for this delivery date and run.'
            });
        }

        const newDriverList = new RunsDriversModel({
            delivery_date: new Date(formattedDate),
            drivers_id,
            draft_drivers,
            created_by: userId,
            run_type,
            created_date: new Date()
        });

        await newDriverList.save();

        res.status(201).json({
            status: true,
            message: 'Drivers info added successfully',
            data: newDriverList,
        });
    } catch (error) {
        logError('createDriversList', error, req.user.user_ref_id);
        handleMongooseError(error, res)
    }
}

const getRunsDrivers = async (req, res) => {
    try {
        const { delivery_date, run_type } = req.query;

        if (!delivery_date) {
            return res.status(400).json({
                status: false,
                message: 'Delivery date is required'
            });
        }

        const parsedDate = new Date(delivery_date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                status: false,
                message: 'Invalid delivery date format'
            });
        }

        const formattedDate = parsedDate.toISOString().split('T')[0];
        const startDate = new Date(formattedDate);
        const endDate = new Date(formattedDate);
        endDate.setDate(endDate.getDate() + 1);

        const matchCondition = {
            delivery_date: {
                $gte: startDate,
                $lt: endDate
            }
        };

        const pipeline = [
            {
                $match: { ...matchCondition, run_type }
            },
            {
                $lookup: {
                    from: 'drivers',
                    localField: 'drivers_id',
                    foreignField: '_id',
                    as: 'drivers'
                }
            },
            {
                $lookup: {
                    from: 'runsdriverorders',
                    let: {
                        driverId: '$drivers_id',
                        deliveryDate: '$delivery_date'
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $in: ['$driver_id', '$$driverId'] },
                                        {
                                            $eq: [
                                                { $dateToString: { format: '%Y-%m-%d', date: '$delivery_date' } },
                                                { $dateToString: { format: '%Y-%m-%d', date: '$$deliveryDate' } }
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'driversOrders'
                }
            },
            {
                $addFields: {
                    drivers: {
                        $map: {
                            input: '$drivers_id',
                            as: 'id',
                            in: {
                                $let: {
                                    vars: {
                                        matchedDriver: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$drivers',
                                                        as: 'd',
                                                        cond: { $eq: ['$$d._id', '$$id'] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        matchedOrder: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$driversOrders',
                                                        as: 'order',
                                                        cond: { $eq: ['$$order.driver_id', '$$id'] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    },
                                    in: {
                                        _id: '$$matchedDriver._id',
                                        name: {
                                            $concat: [
                                                '$$matchedDriver.name',
                                                ` (${run_type})`
                                                // {
                                                //     $cond: {
                                                //         if: { $ifNull: ['$$matchedOrder', false] },
                                                //         then: ` (${run_type})`,
                                                //         else: ''
                                                //     }
                                                // }
                                            ]
                                        },
                                        phone: '$$matchedDriver.phone',
                                        email: '$$matchedDriver.email'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    delivery_date: 1,
                    draft_drivers: 1,
                    drivers: 1,
                    created_date: 1,
                    status: 1,
                    run_type: 1
                }
            },
            {
                $sort: { created_date: -1 }
            }
        ];

        const driversData = await RunsDriversModel.aggregate(pipeline);

        res.status(200).json({
            status: true,
            message: 'Drivers details retrieved successfully',
            data: driversData
        });

    } catch (error) {
        logError('getRunsDrivers', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const getRunsDriversForExport = async (req, res) => {
    try {
        const { delivery_date, run_type = [] } = req.body;

        if (!delivery_date) {
            return res.status(400).json({
                status: false,
                message: 'Delivery date is required'
            });
        }

        const parsedDate = new Date(delivery_date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                status: false,
                message: 'Invalid delivery date format'
            });
        }

        const formattedDate = parsedDate.toISOString().split('T')[0];
        const startDate = new Date(formattedDate);
        const endDate = new Date(formattedDate);
        endDate.setDate(endDate.getDate() + 1);

        const runTypes = Array.isArray(run_type) ? run_type : [run_type];
        
        let allDrivers = [];
        let allDraftDrivers = [];

        for (const type of runTypes) {
            const pipeline = [
                {
                    $match: {
                        delivery_date: { $gte: startDate, $lt: endDate },
                        run_type: type
                    }
                },
                {
                    $lookup: {
                        from: 'drivers',
                        localField: 'driver_id',
                        foreignField: '_id',
                        as: 'drivers'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        drivers: 1,
                        draft_driver: 1
                    }
                },
                {
                    $sort: { order: 1 }
                }
            ];

            const result = await RunsDriversOrderModel.aggregate(pipeline);

            // Collect real drivers
            result.forEach(item => {
                if (Array.isArray(item.drivers)) {
                    allDrivers.push(...item.drivers);
                }

                // Collect draft drivers
                if (item.draft_driver) {
                    allDraftDrivers.push({
                        _id: `draft_${item._id}`,   // ensure unique id
                        name: item.draft_driver,
                        isDraft: true
                    });
                }
            });
        }

        // Remove duplicate actual drivers
        const uniqueDrivers = Object.values(
            allDrivers.reduce((acc, driver) => {
                if (driver && driver._id) {
                    acc[driver._id.toString()] = driver;
                }
                return acc;
            }, {})
        );

        // Remove duplicate draft drivers (by name)
        const uniqueDraftDrivers = Object.values(
            allDraftDrivers.reduce((acc, driver) => {
                const key = driver.name.trim().toLowerCase();
                acc[key] = driver;
                return acc;
            }, {})
        );

        // Combine actual + draft drivers
        const combined = [...uniqueDrivers, ...uniqueDraftDrivers];

        res.status(200).json({
            status: true,
            message: 'Drivers details retrieved successfully',
            drivers: combined
        });

    } catch (error) {
        logError('getRunsDriversForExport', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
};

const getRuns = async (req, res) => {
    try {
        const { delivery_date } = req.query;

        if (!delivery_date) {
            return res.status(400).json({
                status: false,
                message: 'Delivery date is required'
            });
        }

        const parsedDate = new Date(delivery_date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                status: false,
                message: 'Invalid delivery date format'
            });
        }

        const formattedDate = parsedDate.toISOString().split('T')[0];
        const startDate = new Date(formattedDate);
        const endDate = new Date(formattedDate);
        endDate.setDate(endDate.getDate() + 1);

        const matchCondition = {
            delivery_date: {
                $gte: startDate,
                $lt: endDate
            }
        };

        const pipeline = [
            {
                $match: { ...matchCondition }
            },
            {
                $project: {
                    _id: 1,
                    delivery_date: 1,
                    run_type: 1
                }
            },
            {
                $sort: { created_date: -1 }
            }
        ];

        const runsData = await RunsDriversModel.aggregate(pipeline);

        res.status(200).json({
            status: true,
            message: 'Drivers details retrieved successfully',
            data: runsData
        });

    } catch (error) {
        logError('getRuns', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}


const getRunsDriversById = async (req, res) => {
    try {
        const { id } = req.params;
        const driversData = await RunsDriversModel.findById(id);

        res.status(200).json({
            status: true,
            message: 'Drivers details retrieved successfully',
            data: driversData
        });

    } catch (error) {
        logError('getRunsDriversById', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const updateDriversList = async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_date, run_type, drivers_id = [], draft_drivers = [], proceed_driver_delete = false } = req.body;
    const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

    // Convert delivery_date to YYYY-MM-DD format
    const formattedDate = new Date(delivery_date).toISOString().split('T')[0];

    // Get the current record
    const currentRecord = await RunsDriversModel.findById(id);

    if (!currentRecord) {
      return res.status(404).json({ status: false, message: 'Drivers info not found' });
    }

    // Check for date duplication only if delivery_date is being changed
    if (formattedDate !== currentRecord.delivery_date.toISOString().split('T')[0]) {
      const existingRecord = await RunsDriversModel.findOne({
        delivery_date: new Date(formattedDate),
        run_type
      });

      if (existingRecord) {
        return res.status(209).json({
          status: false,
          message: 'A drivers list already exists for this date'
        });
      }
    }

    // Build existingDriver list as strings
    const existingDriverIds = (currentRecord.drivers_id || []).map(d => d.toString());
    // Ensure incoming driver ids are strings too
    const incomingDriverIds = (drivers_id || []).map(d => d.toString());

    // Find IDs that are in existing but NOT in incoming -> removed drivers
    const removedDriverIds = existingDriverIds.filter(idStr => !incomingDriverIds.includes(idStr));

    if (removedDriverIds.length > 0) {
      // Fetch the driver names for the removed ids
      const removedDrivers = await Drivers.find({ _id: { $in: removedDriverIds } }).select('name');

      const removedNames = removedDrivers.map(d => d.name || d._id.toString());

      // If user hasn't confirmed deletion, return the warning message
      if (!proceed_driver_delete) {
        // If you prefer one message per driver, you can join them differently
        const namesStr = removedNames.join(', ');
        return res.status(200).json({
          status: false,
          message: `You trying to unassign the driver/s ${namesStr} please make sure you have copied the orders assigned.`
        });
      }

      // proceed_driver_delete is true -> delete RunsDriversOrderModel entries for those removed drivers
      await RunsDriversOrderModel.deleteMany({
        delivery_date: new Date(formattedDate),
        run_type,
        driver_id: { $in: removedDriverIds.map(id => new mongoose.Types.ObjectId(id)) }
      });
    }

    // Now perform the update (after deletion / checks)
    const updateDrivers = await RunsDriversModel.findByIdAndUpdate(id, {
      delivery_date: new Date(formattedDate),
      drivers_id,
      draft_drivers,
      updated_by: userId,
      run_type,
      updated_date: Date.now(),
    }, { new: true });

    // Re-assign drivers to runs (keep this after update)
    await assignDriversToRuns(formattedDate, run_type, drivers_id, draft_drivers);

    return res.status(200).json({
      status: true,
      message: 'Drivers info updated successfully',
      data: updateDrivers,
    });

  } catch (error) {
    logError('updateDriversList', error, req.user.user_ref_id);
    handleMongooseError(error, res);
  }
};

module.exports = {
    createDriversList,
    getRunsDrivers,
    getRunsDriversById,
    updateDriversList,
    getRunsDriversForExport,
    getRuns
}