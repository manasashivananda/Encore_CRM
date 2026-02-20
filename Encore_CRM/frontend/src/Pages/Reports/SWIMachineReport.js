import React, { useState, useEffect, useCallback, useRef } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, HeadingFour, MyDiv, SpanTag, PTag, HeadingThree } from "../Common/Components";
import { MenuItem, Button, TextField, IconButton, Tooltip, Tabs, Tab, Box, Grid, Switch, FormControlLabel } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import axios from "axios";
import { TbTableExport } from "react-icons/tb";
import * as XLSX from "xlsx";
import { FiPackage, FiTrash2 } from "react-icons/fi";
import { ImStackoverflow } from "react-icons/im";
import Swal from "sweetalert2";
import { DateTime } from "luxon";
import CustomDataGrid from "../Common/customDataGrid";
import moment from "moment";
import { GiSteelClaws } from "react-icons/gi";
import { RiPercentLine } from "react-icons/ri";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function SWIMachineReport() {
  const navigate = useNavigate();
  const [machineId, setMachineId] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [machinesList, setMachinesList] = useState([]);
  const [materialsList, setMaterialsList] = useState([]);
  const [colorsList, setColorsList] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    startDate: moment().startOf('day').format("DD-MMM-YYYY hh:mm A"),
    endDate: moment().endOf('day').format("DD-MMM-YYYY hh:mm A"),
    convertedStartDate: moment().startOf('day').format("YYYY-MM-DD HH:mm:ss"),
    convertedEndDate: moment().endOf('day').format("YYYY-MM-DD HH:mm:ss"),
    dateMode: "Custom Range",
  });
  const [isDateRange, setIsDateRange] = useState(false);
  const [hourlyMode, setHourlyMode] = useState(true);
  const [totals, setTotals] = useState({ totalOffcutsArea: 0, totalWasteArea: 0, totalProductArea: 0, totalCutArea: 0, totalResult: 0 });
  const cancelToken = useRef(null);
  const cancelTokenDetailed = useRef(null);
  const cancelTokenFold = useRef(null);
  const [detailedReportData, setDetailedReportData] = useState([]);
  const [foldReportData, setFoldReportData] = useState([]);
  const [foldMachinesList, setFoldMachinesList] = useState([]);
  const [foldMachineId, setFoldMachineId] = useState("");
  const [foldTotals, setFoldTotals] = useState({ totalPieces: 0 });
  const [activeTab, setActiveTab] = useState(0);
  const [detailedTotals, setDetailedTotals] = useState({
    cutLength: 0,
    cutArea: 0,
    productArea: 0,
    offcutArea: 0,
    wasteArea: 0,
    workPieces: 0,
    offcuts: 0,
    productLinearLength: 0,
    offcutsLinearLength: 0,
    wasteLinearLength: 0,
    joggedLinearLength: 0
  });

  // Columns for Wastage & Offcuts table (single day - hourly view)
  const offcutsColumns = [
    { 
      field: 'timeRange', 
      headerName: 'Time Range', 
      flex: 0.7,
      minWidth: 150,
    },
    { 
      field: 'machineId', 
      headerName: 'Machine ID', 
      flex: 1.6,
      minWidth: 200,
      renderCell: (params) => (
        <div style={{
          width: '100%',
          textAlign: params.row.id === 'totals' ? 'right' : 'left',
          fontWeight: params.row.id === 'totals' ? 'bold' : 'normal'
        }}>
          {params.value}
        </div>
      )
    },
    {
      field: 'cutArea',
      headerName: 'Used [m²]',
      flex: 0.5,
      minWidth: 120,
      type: 'number'
    },
    {
      field: 'productArea',
      headerName: 'Product [m²]',
      flex: 0.8,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'offcutsArea', 
      headerName: 'Offcut [m²]', 
      flex: 0.6,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'wasteArea', 
      headerName: 'Waste [m²]', 
      flex: 0.6,
      minWidth: 120,
      type: 'number'
    },
    {
      field: 'result',
      headerName: 'Result [(Offcut + Waste)/Used] [%]',
      flex: 1,
      minWidth: 50,
      type: 'number',
    }
  ];

  // Columns for Wastage & Offcuts table (date range - daily view)
  const offcutsDateRangeColumns = [
    { 
      field: 'date', 
      headerName: 'Date', 
      flex: 1,
      minWidth: 150
    },
    { 
      field: 'machineId', 
      headerName: 'Machine ID', 
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <div style={{
          width: '100%',
          textAlign: params.row.id === 'totals' ? 'right' : 'left',
          fontWeight: params.row.id === 'totals' ? 'bold' : 'normal'
        }}>
          {params.value}
        </div>
      )
    },
    {
      field: 'cutArea',
      headerName: 'Used [m²]',
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    {
      field: 'productArea',
      headerName: 'Product [m²]',
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'offcutsArea', 
      headerName: 'Offcut [m²]', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'wasteArea', 
      headerName: 'Waste [m²]', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    {
      field: 'result',
      headerName: 'Result [(Offcut + Waste)/Used] [%]',
      flex: 1,
      minWidth: 80,
      type: 'number',
    }
  ];

  // Columns for Detailed Report table (single day - hourly view)
  const detailedColumns = [
    { 
      field: 'timeRange', 
      headerName: 'Time Range', 
      flex: 1,
      minWidth: 150
    },
    { 
      field: 'machineId', 
      headerName: 'Machine ID', 
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <div style={{
          width: '100%',
          textAlign: params.row.id === 'totals' ? 'right' : 'left',
          fontWeight: params.row.id === 'totals' ? 'bold' : 'normal'
        }}>
          {params.value}
        </div>
      )
    },
    { 
      field: 'material', 
      headerName: 'Material', 
      flex: 1,
      minWidth: 120
    },
    { 
      field: 'colour', 
      headerName: 'Colour', 
      flex: 1,
      minWidth: 120
    },
    { 
      field: 'cutLength', 
      headerName: 'Cut Length', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'cutArea', 
      headerName: 'Cut Area', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'productArea', 
      headerName: 'Product Area', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'offcutArea', 
      headerName: 'Offcut Area', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'wasteArea', 
      headerName: 'Waste Area', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'workPieces', 
      headerName: 'Work Pieces', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'offcuts', 
      headerName: 'Offcuts', 
      flex: 1,
      minWidth: 100,
      type: 'number'
    },
    { 
      field: 'productLinearLength', 
      headerName: 'Product [LM]', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'offcutsLinearLength', 
      headerName: 'Offcuts [LM]', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'wasteLinearLength', 
      headerName: 'Waste [LM]', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'joggedLinearLength', 
      headerName: 'Jogged [LM]', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    }
  ];

  // Columns for Detailed Report table (date range - daily view)
  const detailedDateRangeColumns = [
    { 
      field: 'date', 
      headerName: 'Date', 
      flex: 1,
      minWidth: 150
    },
    { 
      field: 'machineId', 
      headerName: 'Machine ID', 
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <div style={{
          width: '100%',
          textAlign: params.row.id === 'totals' ? 'right' : 'left',
          fontWeight: params.row.id === 'totals' ? 'bold' : 'normal'
        }}>
          {params.value}
        </div>
      )
    },
    { 
      field: 'material', 
      headerName: 'Material', 
      flex: 1,
      minWidth: 120
    },
    { 
      field: 'colour', 
      headerName: 'Colour', 
      flex: 1,
      minWidth: 120
    },
    { 
      field: 'cutLength', 
      headerName: 'Cut Length', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'cutArea', 
      headerName: 'Cut Area', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'productArea', 
      headerName: 'Product Area', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'offcutArea', 
      headerName: 'Offcut Area', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'wasteArea', 
      headerName: 'Waste Area', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'workPieces', 
      headerName: 'Work Pieces', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'offcuts', 
      headerName: 'Offcuts', 
      flex: 1,
      minWidth: 100,
      type: 'number'
    },
    { 
      field: 'productLinearLength', 
      headerName: 'Product [LM]', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'offcutsLinearLength', 
      headerName: 'Offcuts [LM]', 
      flex: 1,
      minWidth: 130,
      type: 'number'
    },
    { 
      field: 'wasteLinearLength', 
      headerName: 'Waste [LM]', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    },
    { 
      field: 'joggedLinearLength', 
      headerName: 'Jogged [LM]', 
      flex: 1,
      minWidth: 120,
      type: 'number'
    }
  ];

  // Columns for Fold Report (hourly view)
  const foldColumns = [
    { 
      field: 'timeRange', 
      headerName: 'Time Range', 
      flex: 1,
      minWidth: 150
    },
    { 
      field: 'machineName', 
      headerName: 'Machine Name', 
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <div style={{
          width: '100%',
          textAlign: params.row.id === 'totals' ? 'right' : 'left',
          fontWeight: params.row.id === 'totals' ? 'bold' : 'normal'
        }}>
          {params.value}
        </div>
      )
    },
    { 
      field: 'totalPieces', 
      headerName: 'Total Pieces Folded', 
      flex: 1,
      minWidth: 150,
      type: 'number'
    }
  ];

  // Columns for Fold Report (date range - daily view)
  const foldDateRangeColumns = [
    { 
      field: 'date', 
      headerName: 'Date', 
      flex: 1,
      minWidth: 150
    },
    { 
      field: 'machineName', 
      headerName: 'Machine Name', 
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <div style={{
          width: '100%',
          textAlign: params.row.id === 'totals' ? 'right' : 'left',
          fontWeight: params.row.id === 'totals' ? 'bold' : 'normal'
        }}>
          {params.value}
        </div>
      )
    },
    { 
      field: 'totalPieces', 
      headerName: 'Total Pieces Folded', 
      flex: 1,
      minWidth: 150,
      type: 'number'
    }
  ];

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleDateRangeChange = (e, { startDate, endDate }) => {
    let chosenDateMode;
    for (const key in e.target) {
      if (key.startsWith("jQuery")) {
        const widget = e.target[key];
        if (widget?.daterangepicker?.chosenLabel) {
          chosenDateMode = widget.daterangepicker.chosenLabel;
          break;
        }
      }
    }
    
    // Default behavior based on preset
    const dailyPresets = ["Last 7 Days", "Last 30 Days", "This Month", "Last Month"];
    
    let newHourlyMode;
    let newIsDateRange;
    
    if (dailyPresets.includes(chosenDateMode)) {
      // Multi-day presets: default to daily view
      newHourlyMode = false;
      newIsDateRange = true;
    } else {
      // Today, Yesterday, Custom Range: default to hourly with exact time filtering
      newHourlyMode = true;
      newIsDateRange = false;
    }
    
    setHourlyMode(newHourlyMode);
    setIsDateRange(newIsDateRange);
    
    // Always store the exact times from the picker
    setDateFilter({
      startDate: startDate.format("DD-MMM-YYYY hh:mm A"),
      endDate: endDate.format("DD-MMM-YYYY hh:mm A"),
      convertedStartDate: startDate.format("YYYY-MM-DD HH:mm:ss"),
      convertedEndDate: endDate.format("YYYY-MM-DD HH:mm:ss"),
      dateMode: chosenDateMode || "Custom Range",
    });
  };


  const loadMachineOffcutsReport = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;

    const fromTime = dateFilter.convertedStartDate;
    const toTime = dateFilter.convertedEndDate;

    console.log('[OffcutsReport] Sending:', { fromTime, toTime, isDateRange, hourlyMode });
    setLoading(true);
    const url = `${API_BASE_URL}fetch-swi-machine-offcuts-report?machineId=${machineId}&startDate=${encodeURIComponent(fromTime)}&endDate=${encodeURIComponent(toTime)}&isDateRange=${isDateRange}`;
    try {
      const response = await axios.get(url, { 
        headers: { 
          "x-access-token": localStorage.getItem("token"), 
          Accept: "application/json", 
          "Content-Type": "application/json" 
        }, 
        cancelToken: source.token 
      });
      
      // Add unique id for DataGrid
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: index
      }));
      
      // Calculate totals
      const totalOffcutsArea = response.data.reduce((sum, item) => sum + parseFloat(item.offcutsArea || 0), 0);
      const totalWasteArea = response.data.reduce((sum, item) => sum + parseFloat(item.wasteArea || 0), 0);
      const totalProductArea = response.data.reduce((sum, item) => sum + parseFloat(item.productArea || 0), 0);
      const totalCutArea = response.data.reduce((sum, item) => sum + parseFloat(item.cutArea || 0), 0);
      const totalResult = totalOffcutsArea + totalWasteArea === 0 ? 0 : ((totalOffcutsArea + totalWasteArea) / totalCutArea) * 100;
      
      setTotals({
        totalOffcutsArea: totalOffcutsArea.toFixed(1),
        totalWasteArea: totalWasteArea.toFixed(1),
        totalProductArea: totalProductArea.toFixed(1),
        totalCutArea: totalCutArea.toFixed(1),
        totalResult: totalResult.toFixed(2)
      });

      // Add totals row to the data
      const totalsRow = isDateRange 
        ? {
            id: 'totals',
            date: '',
            machineId: 'GRAND TOTAL',
            offcutsArea: totalOffcutsArea.toFixed(1),
            wasteArea: totalWasteArea.toFixed(1),
            productArea: totalProductArea.toFixed(1),
            cutArea: totalCutArea.toFixed(1),
            result: totalResult.toFixed(2)
          }
        : {
            id: 'totals',
            timeRange: '',
            machineId: 'GRAND TOTAL',
            offcutsArea: totalOffcutsArea.toFixed(1),
            wasteArea: totalWasteArea.toFixed(1),
            productArea: totalProductArea.toFixed(1),
            cutArea: totalCutArea.toFixed(1),
            result: totalResult.toFixed(2)
          };

      const dataWithTotals = [...dataWithIds, totalsRow];
      
      setHourlyData(dataWithTotals);

    } catch (error) {
      if (!axios.isCancel(error)) {
        console.log(error);
        Swal.fire({
          text: "Failed to fetch report data",
          icon: "error",
          type: "error",
        });
      }
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [machineId, dateFilter, isDateRange]);

  useEffect(() => {
    if (activeTab === 0) {
      loadMachineOffcutsReport();
    }
  }, [machineId, dateFilter, isDateRange, activeTab, loadMachineOffcutsReport]);

  useEffect(() => {
    loadMachines();
  }, []);

  const loadMachineDetailedReport = useCallback(async () => {
    if (cancelTokenDetailed.current) {
      cancelTokenDetailed.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelTokenDetailed.current = source;
    
    const fromTime = dateFilter.convertedStartDate;
    const toTime = dateFilter.convertedEndDate;
    
    console.log('[DetailedReport] Sending:', { fromTime, toTime, isDateRange, hourlyMode });
    setLoading(true);
    const url = `${API_BASE_URL}fetch-swi-machine-detailed-report?machineId=${machineId}&startDate=${encodeURIComponent(fromTime)}&endDate=${encodeURIComponent(toTime)}&isDateRange=${isDateRange}&material=${material}&colour=${color}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        cancelToken: source.token
      });
      
      // Add unique id for DataGrid
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: index
      }));
      
      // Calculate detailed totals
      const totals = response.data.reduce((acc, item) => ({
        cutLength: acc.cutLength + parseFloat(item.cutLength || 0),
        cutArea: acc.cutArea + parseFloat(item.cutArea || 0),
        productArea: acc.productArea + parseFloat(item.productArea || 0),
        offcutArea: acc.offcutArea + parseFloat(item.offcutArea || 0),
        wasteArea: acc.wasteArea + parseFloat(item.wasteArea || 0),
        workPieces: acc.workPieces + (item.workPieces || 0),
        offcuts: acc.offcuts + (item.offcuts || 0),
        productLinearLength: acc.productLinearLength + parseFloat(item.productLinearLength || 0),
        offcutsLinearLength: acc.offcutsLinearLength + parseFloat(item.offcutsLinearLength || 0),
        wasteLinearLength: acc.wasteLinearLength + parseFloat(item.wasteLinearLength || 0),
        joggedLinearLength: acc.joggedLinearLength + parseFloat(item.joggedLinearLength || 0)
      }), {
        cutLength: 0,
        cutArea: 0,
        productArea: 0,
        offcutArea: 0,
        wasteArea: 0,
        workPieces: 0,
        offcuts: 0,
        productLinearLength: 0,
        offcutsLinearLength: 0,
        wasteLinearLength: 0,
        joggedLinearLength: 0
      });
      
      const calculatedTotals = {
        cutLength: totals.cutLength.toFixed(3),
        cutArea: totals.cutArea.toFixed(3),
        productArea: totals.productArea.toFixed(3),
        offcutArea: totals.offcutArea.toFixed(3),
        wasteArea: totals.wasteArea.toFixed(3),
        workPieces: totals.workPieces,
        offcuts: totals.offcuts,
        productLinearLength: totals.productLinearLength.toFixed(3),
        offcutsLinearLength: totals.offcutsLinearLength.toFixed(3),
        wasteLinearLength: totals.wasteLinearLength.toFixed(3),
        joggedLinearLength: totals.joggedLinearLength.toFixed(3)
      };

      setDetailedTotals(calculatedTotals);

      // Add totals row to the data
      const totalsRow = isDateRange
        ? {
            id: 'totals',
            date: '',
            machineId: 'GRAND TOTAL',
            material: '',
            colour: '',
            cutLength: calculatedTotals.cutLength,
            cutArea: calculatedTotals.cutArea,
            productArea: calculatedTotals.productArea,
            offcutArea: calculatedTotals.offcutArea,
            wasteArea: calculatedTotals.wasteArea,
            workPieces: calculatedTotals.workPieces,
            offcuts: calculatedTotals.offcuts,
            productLinearLength: calculatedTotals.productLinearLength,
            offcutsLinearLength: calculatedTotals.offcutsLinearLength,
            wasteLinearLength: calculatedTotals.wasteLinearLength,
            joggedLinearLength: calculatedTotals.joggedLinearLength
          }
        : {
            id: 'totals',
            timeRange: '',
            machineId: 'GRAND TOTAL',
            material: '',
            colour: '',
            cutLength: calculatedTotals.cutLength,
            cutArea: calculatedTotals.cutArea,
            productArea: calculatedTotals.productArea,
            offcutArea: calculatedTotals.offcutArea,
            wasteArea: calculatedTotals.wasteArea,
            workPieces: calculatedTotals.workPieces,
            offcuts: calculatedTotals.offcuts,
            productLinearLength: calculatedTotals.productLinearLength,
            offcutsLinearLength: calculatedTotals.offcutsLinearLength,
            wasteLinearLength: calculatedTotals.wasteLinearLength,
            joggedLinearLength: calculatedTotals.joggedLinearLength
          };

      const dataWithTotals = [...dataWithIds, totalsRow];
      
      setDetailedReportData(dataWithTotals);
      
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.log(error);
        Swal.fire({
          text: "Failed to fetch detailed report data",
          icon: "error",
          type: "error",
        });
      }
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [machineId, dateFilter, isDateRange, material, color]);

  useEffect(() => {
    if (activeTab === 1) {
      loadMachineDetailedReport();
    }
  }, [machineId, dateFilter, isDateRange, material, color, activeTab, loadMachineDetailedReport]);

  const loadMachines = async () => {
    const url = API_BASE_URL + `fetch-machine-data-dropdown`;
    try {
      const res = await axios.get(url, { 
        headers: { 
          "x-access-token": localStorage.getItem("token"), 
          Accept: "application/json", 
          "Content-Type": "application/json" 
        } 
      });
      setMachinesList(res.data.Machines);
      setMaterialsList(res.data.Materials);
    } catch (error) {
      console.error("Failed to fetch machines:", error);
    }
  };

  const loadColorsByMaterial = async material => {
    const url = API_BASE_URL + `fetch-machine-material-colour-dropdown?material=${material}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });
      setColorsList(res.data.Colours);
    } catch (error) {
      console.error("Failed to fetch colors:", error);
    }
  }

  useEffect(() => {
    if (material) {
      loadColorsByMaterial(material);
    }
  }, [material]);

  // Load fold machines dropdown
  const loadFoldMachines = async () => {
    const url = API_BASE_URL + `fetch-folding-machines-dropdown`;
    try {
      const res = await axios.get(url, { 
        headers: { 
          "x-access-token": localStorage.getItem("token"), 
          Accept: "application/json", 
          "Content-Type": "application/json" 
        } 
      });
      setFoldMachinesList(res.data.Machines);
    } catch (error) {
      console.error("Failed to fetch fold machines:", error);
    }
  };

  // Load fold report data
  const loadMachineFoldReport = useCallback(async () => {
    if (cancelTokenFold.current) {
      cancelTokenFold.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelTokenFold.current = source;

    const fromTime = dateFilter.convertedStartDate;
    const toTime = dateFilter.convertedEndDate;

    setLoading(true);
    const url = `${API_BASE_URL}fetch-swi-machine-fold-report?machineId=${foldMachineId}&startDate=${encodeURIComponent(fromTime)}&endDate=${encodeURIComponent(toTime)}&isDateRange=${isDateRange}`;
    try {
      const response = await axios.get(url, { 
        headers: { 
          "x-access-token": localStorage.getItem("token"), 
          Accept: "application/json", 
          "Content-Type": "application/json" 
        }, 
        cancelToken: source.token 
      });
      
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: index
      }));
      
      const totalPieces = response.data.reduce((sum, item) => sum + parseInt(item.totalPieces || 0), 0);
      
      setFoldTotals({ totalPieces });

      const totalsRow = isDateRange 
        ? { id: 'totals', date: '', machineName: 'GRAND TOTAL', totalPieces }
        : { id: 'totals', timeRange: '', machineName: 'GRAND TOTAL', totalPieces };

      setFoldReportData([...dataWithIds, totalsRow]);

    } catch (error) {
      if (!axios.isCancel(error)) {
        console.log(error);
        Swal.fire({ text: "Failed to fetch fold report data", icon: "error" });
      }
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [foldMachineId, dateFilter, isDateRange]);

  // Load fold machines on mount
  useEffect(() => {
    loadFoldMachines();
  }, []);

  // useEffect for fold report tab
  useEffect(() => {
    if (activeTab === 2) {
      loadMachineFoldReport();
    }
  }, [foldMachineId, dateFilter, isDateRange, activeTab, loadMachineFoldReport]);

  const handleFoldMachineChange = event => {
    const { value } = event.target;
    setFoldMachineId(value);
  };

  const handleMachineChange = event => {
    const { name, value } = event.target;
    if (name === "machineId") {
      setMachineId(value);
    }
  };

  const handleMaterialChange = event => {
    const { name, value } = event.target;
    if (name === "material") {
      setColorsList([]);
      setColor("");
      setMaterial(value);
      loadColorsByMaterial(value);
    }
  };

  const handleColourChange = event => {
    const { name, value } = event.target;
    if (name === "colour") {
      setColor(value);
    }
  };

  const handleHourlyModeToggle = (event) => {
    const newHourlyMode = event.target.checked;
    setHourlyMode(newHourlyMode);
    // Toggle ON → hourly (isDateRange=false), Toggle OFF → daily (isDateRange=true)
    setIsDateRange(!newHourlyMode);
  };

  const handleReset = () => {
    setMachineId("");
    setMaterial("");
    setColor("");
    setColorsList([]);
    setFoldMachineId("");
    setHourlyMode(true);
    setDateFilter({
      startDate: moment().startOf('day').format("DD-MMM-YYYY hh:mm A"),
      endDate: moment().endOf('day').format("DD-MMM-YYYY hh:mm A"),
      convertedStartDate: moment().startOf('day').format("YYYY-MM-DD HH:mm:ss"),
      convertedEndDate: moment().endOf('day').format("YYYY-MM-DD HH:mm:ss"),
      dateMode: "Custom Range",
    });
    setIsDateRange(false);
    setTotals({ totalOffcutsArea: 0, totalWasteArea: 0, totalProductArea: 0, totalCutArea: 0 });
    setHourlyData([]);
    setDetailedReportData([]);
    setFoldReportData([]);
    setFoldTotals({ totalPieces: 0 });
    setDetailedTotals({
      cutLength: 0,
      cutArea: 0,
      productArea: 0,
      offcutArea: 0,
      wasteArea: 0,
      workPieces: 0,
      offcuts: 0,
      productLinearLength: 0,
      offcutsLinearLength: 0,
      wasteLinearLength: 0,
      joggedLinearLength: 0
    });
  };

  const getDateRangeLabel = () => {
    return `${dateFilter.startDate} - ${dateFilter.endDate}`;
  };
  
  const exportToExcel = useCallback(() => {
    if (activeTab === 0) {
      const dataForExport = hourlyData
        .filter(item => item.id !== 'totals')
        .map(item => {
          if (isDateRange) {
            return {
              "Date": item.date,
              "Machine ID": item.machineId,
              "Used [m²]": item.cutArea,
              "Product [m²]": item.productArea,
              "Offcut [m²]": item.offcutsArea,
              "Waste [m²]": item.wasteArea,
              "Result [%]": item.result
            };
          }
          return {
            "Time Range": item.timeRange,
            "Machine ID": item.machineId,
            "Used [m²]": item.cutArea,
            "Product [m²]": item.productArea,
            "Offcut [m²]": item.offcutsArea,
            "Waste [m²]": item.wasteArea,
            "Result [%]": item.result
          };
        });

      if (isDateRange) {
        dataForExport.push({
          "Date": "",
          "Machine ID": "GRAND TOTAL",
          "Used [m²]": totals.totalCutArea,
          "Product [m²]": totals.totalProductArea,
          "Offcut [m²]": totals.totalOffcutsArea,
          "Waste [m²]": totals.totalWasteArea,
          "Result [%]": totals.totalResult
        });
      } else {
        dataForExport.push({
          "Time Range": "",
          "Machine ID": "GRAND TOTAL",
          "Used [m²]": totals.totalCutArea,
          "Product [m²]": totals.totalProductArea,
          "Offcut [m²]": totals.totalOffcutsArea,
          "Waste [m²]": totals.totalWasteArea,
          "Result [%]": totals.totalResult
        });
      }

      const ws = XLSX.utils.json_to_sheet(dataForExport);
      const wb = XLSX.utils.book_new();
      ws["!cols"] = autoColumnWidth(dataForExport);
      XLSX.utils.book_append_sheet(wb, ws, "Machine Offcuts Report");
      XLSX.writeFile(wb, `Machine_Offcuts_Report_${machineId || 'All'}_${dateFilter.startDate.replace(/[:\s]/g, '_')}_to_${dateFilter.endDate.replace(/[:\s]/g, '_')}.xlsx`);
    } else if (activeTab === 1) {
      const dataForExport = detailedReportData
        .filter(item => item.id !== 'totals')
        .map(item => {
          const baseData = {
            "Machine ID": item.machineId,
            "Material": item.material,
            "Color": item.colour,
            "Cut Length": item.cutLength,
            "Cut Area": item.cutArea,
            "Product Area": item.productArea,
            "Offcut Area": item.offcutArea,
            "Waste Area": item.wasteArea,
            "Work Pieces": item.workPieces,
            "Offcuts": item.offcuts,
            "Product [LM]": item.productLinearLength,
            "Offcuts [LM]": item.offcutsLinearLength,
            "Waste [LM]": item.wasteLinearLength,
            "Jogged [LM]": item.joggedLinearLength
          };
          
          if (isDateRange) {
            return { "Date": item.date, ...baseData };
          }
          return { "Time Range": item.timeRange, ...baseData };
        });

      const totalsExport = {
        "Machine ID": "GRAND TOTAL:",
        "Material": "",
        "Color": "",
        "Cut Length": detailedTotals.cutLength,
        "Cut Area": detailedTotals.cutArea,
        "Product Area": detailedTotals.productArea,
        "Offcut Area": detailedTotals.offcutArea,
        "Waste Area": detailedTotals.wasteArea,
        "Work Pieces": detailedTotals.workPieces,
        "Offcuts": detailedTotals.offcuts,
        "Product [LM]": detailedTotals.productLinearLength,
        "Offcuts [LM]": detailedTotals.offcutsLinearLength,
        "Waste [LM]": detailedTotals.wasteLinearLength,
        "Jogged [LM]": detailedTotals.joggedLinearLength
      };

      if (isDateRange) {
        dataForExport.push({ "Date": "", ...totalsExport });
      } else {
        dataForExport.push({ "Time Range": "", ...totalsExport });
      }

      const ws = XLSX.utils.json_to_sheet(dataForExport);
      const wb = XLSX.utils.book_new();
      ws["!cols"] = autoColumnWidth(dataForExport);
      XLSX.utils.book_append_sheet(wb, ws, "Detailed Report");
      XLSX.writeFile(wb, `Machine_Detailed_Report_${machineId || 'All'}_${dateFilter.startDate.replace(/[:\s]/g, '_')}_to_${dateFilter.endDate.replace(/[:\s]/g, '_')}.xlsx`);
    } else if (activeTab === 2) {
      // Fold Report export
      const dataForExport = foldReportData
        .filter(item => item.id !== 'totals')
        .map(item => {
          if (isDateRange) {
            return {
              "Date": item.date,
              "Machine Name": item.machineName,
              "Total Pieces Folded": item.totalPieces
            };
          }
          return {
            "Time Range": item.timeRange,
            "Machine Name": item.machineName,
            "Total Pieces Folded": item.totalPieces
          };
        });

      if (isDateRange) {
        dataForExport.push({ "Date": "", "Machine Name": "GRAND TOTAL", "Total Pieces Folded": foldTotals.totalPieces });
      } else {
        dataForExport.push({ "Time Range": "", "Machine Name": "GRAND TOTAL", "Total Pieces Folded": foldTotals.totalPieces });
      }

      const ws = XLSX.utils.json_to_sheet(dataForExport);
      const wb = XLSX.utils.book_new();
      ws["!cols"] = autoColumnWidth(dataForExport);
      XLSX.utils.book_append_sheet(wb, ws, "Machine Fold Report");
      XLSX.writeFile(wb, `Machine_Fold_Report_${foldMachineId || 'All'}_${dateFilter.startDate.replace(/[:\s]/g, '_')}_to_${dateFilter.endDate.replace(/[:\s]/g, '_')}.xlsx`);
    }
    
    Swal.fire({
      text: "Successfully Exported",
      icon: "success",
      type: "success",
    });
  }, [hourlyData, detailedReportData, foldReportData, totals, detailedTotals, foldTotals, machineId, foldMachineId, dateFilter, isDateRange, activeTab]);

  const autoColumnWidth = data => {
    const keys = Object.keys(data[0]);
    return keys.map(key => ({ wch: Math.max(key.length, ...data.map(row => (row[key] ? row[key].toString().length : 0))) }));
  };

  // Custom row class to style the totals row
  const getRowClassName = (params) => {
    return params.id === 'totals' ? 'totals-row' : '';
  };

  const [sortModel, setSortModel] = useState([]);

  const sortRowsExcludingTotals = (rows, model) => {
    if (!rows || rows.length === 0) return rows;
    const totalsRow = rows.find(r => r.id === 'totals');
    const rowsToSort = rows.filter(r => r.id !== 'totals');

    if (!model || model.length === 0) {
      return totalsRow ? [...rowsToSort, totalsRow] : rowsToSort;
    }

    const { field, sort } = model[0];
    const dir = sort === 'asc' ? 1 : -1;

    const compare = (a, b) => {
      const va = a[field] ?? '';
      const vb = b[field] ?? '';

      const na = parseFloat(va);
      const nb = parseFloat(vb);
      const bothNumbers = !Number.isNaN(na) && !Number.isNaN(nb);

      if (bothNumbers) {
        return (na - nb) * dir;
      }

      // fallback to string comparison
      return String(va).localeCompare(String(vb)) * dir;
    };

    const sorted = [...rowsToSort].sort(compare);
    return totalsRow ? [...sorted, totalsRow] : sorted;
  };

  const handleSortModelChange = (newModel) => {
    setSortModel(newModel);
    // Apply server-side sorting behavior locally, keeping totals row last
    if (activeTab === 0) {
      setHourlyData(prev => sortRowsExcludingTotals(prev, newModel));
    } else if (activeTab === 1) {
      setDetailedReportData(prev => sortRowsExcludingTotals(prev, newModel));
    } else if (activeTab === 2) {
      setFoldReportData(prev => sortRowsExcludingTotals(prev, newModel));
    }
  };

  // Date range presets using moment - with time
  const ranges = {
    Today: [moment().startOf('day'), moment().endOf('day')],
    Yesterday: [moment().subtract(1, "days").startOf('day'), moment().subtract(1, "days").endOf('day')],
    "Last 7 Days": [moment().subtract(6, "days").startOf('day'), moment().endOf('day')],
    "Last 30 Days": [moment().subtract(29, "days").startOf('day'), moment().endOf('day')],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  // Get the appropriate columns based on whether it's a date range or single day
  const getCurrentOffcutsColumns = () => isDateRange ? offcutsDateRangeColumns : offcutsColumns;
  const getCurrentDetailedColumns = () => isDateRange ? detailedDateRangeColumns : detailedColumns;
  const getCurrentFoldColumns = () => isDateRange ? foldDateRangeColumns : foldColumns;

  return (
    <React.Fragment>
      <style>
        {`
          /* Override DataGrid header background color */
          .MuiDataGrid-columnHeaders {
            background-color: #e2bd93 !important;
          }
          .MuiDataGrid-columnHeader {
            padding: 8px !important;
            border: 1px solid darkgrey;
            background-color: #e2bd93 !important;
            color: #fff !important;
          }
        `}
      </style>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            SWI Machine Report
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-1 d-block">
            <Row>
              {(activeTab === 0 || activeTab === 1) && (
                <Col md={3} xs={9} className="SearchTextBox">
                  <TextField 
                    select 
                    variant="outlined" 
                    size="small" 
                    label="Machine Name" 
                    name="machineId" 
                    value={machineId} 
                    SelectProps={{ onChange: handleMachineChange }} 
                    className="form-control"
                  >
                    {machinesList.map(machine => (
                      <MenuItem key={machine} value={machine}>
                        {machine}
                      </MenuItem>
                    ))}
                  </TextField>
                </Col>
              )}
              {activeTab === 2 && (
                <Col md={3} xs={9} className="SearchTextBox">
                  <TextField 
                    select 
                    variant="outlined" 
                    size="small" 
                    label="Fold Machine Name" 
                    name="foldMachineId" 
                    value={foldMachineId} 
                    SelectProps={{ onChange: handleFoldMachineChange }} 
                    className="form-control"
                  >
                    {foldMachinesList.map(machine => (
                      <MenuItem key={machine} value={machine}>
                        {machine}
                      </MenuItem>
                    ))}
                  </TextField>
                </Col>
              )}
              {activeTab === 1 && (
                <>
                  <Col md={2} xs={9} className="SearchTextBox">
                    <TextField 
                      select 
                      variant="outlined"
                      size="small"
                      label="Material"
                      name="material"
                      value={material}
                      SelectProps={{ onChange: handleMaterialChange }}
                      className="form-control"
                    >
                      {materialsList.map(material => (
                        <MenuItem key={material} value={material}>
                          {material}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={2} xs={9} className="SearchTextBox">
                    <TextField 
                      select 
                      variant="outlined"
                      size="small"
                      label="Colour"
                      name="colour"
                      value={color}
                      SelectProps={{ onChange: handleColourChange }}
                      className="form-control"
                      disabled={!material}
                    >
                      {colorsList.map(colour => (
                        <MenuItem key={colour} value={colour}>
                          {colour}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                </>
              )}
              <Col md={3}>
                <DateRangePicker
                  key={`${dateFilter.convertedStartDate}-${dateFilter.convertedEndDate}`}
                  initialSettings={{
                    startDate: moment(dateFilter.convertedStartDate),
                    endDate: moment(dateFilter.convertedEndDate),
                    ranges: ranges,
                    timePicker: true,
                    timePicker24Hour: false,
                    timePickerIncrement: 15,
                    locale: { 
                      format: "DD-MMM-YYYY hh:mm A",
                      applyLabel: "Apply",
                      cancelLabel: "Cancel"
                    },
                    alwaysShowCalendars: true,
                  }}
                  onApply={handleDateRangeChange}
                >
                  <TextField
                    variant="outlined"
                    size="small"
                    label="Select Date & Time Range"
                    value={getDateRangeLabel()}
                    InputProps={{
                      readOnly: true,
                    }}
                    className="form-control"
                    style={{ cursor: 'pointer' }}
                  />
                </DateRangePicker>
              </Col>
              <Col md={activeTab === 1 ? 2 : 4} className="d-flex align-items-center">
                <FormControlLabel
                  control={
                    <Switch
                      checked={hourlyMode}
                      onChange={handleHourlyModeToggle}
                      color="primary"
                      size="small"
                    />
                  }
                  label={hourlyMode ? "Hourly" : "Daily"}
                  sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                />
                <Button className="btn secondary-btn add-cta search mx-1 mt-1" onClick={handleReset}>
                  Reset
                </Button>
                <Tooltip title="Export Excel" className="mx-2">
                  <IconButton
                    aria-label="Export To Excel"
                    color="success"
                    disabled={
                      (activeTab === 0 && !hourlyData.length) ||
                      (activeTab === 1 && !detailedReportData.length) ||
                      (activeTab === 2 && !foldReportData.length)
                    }
                    sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#30bf5c", "&:hover": { backgroundColor: "#30bf5c" } }}
                    component="a"
                    onClick={exportToExcel}
                  >
                    <TbTableExport />
                  </IconButton>
                </Tooltip>
              </Col>
            </Row>
          </MyDiv>
        </Col>
      </Row>
      
      <Row className="mt-1">
        <Col md={12}>
          <Box className="GeneralHeading">
            <Tabs value={activeTab} onChange={handleTabChange} aria-label="report tabs">
              <Tab label="Waste & Offcut Report" />
              <Tab label="Detailed Report" />
              <Tab label="Fold Report" />
            </Tabs>
          </Box>
        </Col>
      </Row>

      <React.Fragment>
        {activeTab === 0 && (
          <>
            <Grid container className="DashboardTop mt-1" gap={1}>
              <Grid item md={2.3}>
                <MyDiv className="DashboardTopItem" style={{marginBottom: '0'}}>
                  <SpanTag className="DashboardTopItemIcon">
                    <FiPackage />
                  </SpanTag>
                  <MyDiv className="DashboardTopItemContent">
                    <HeadingThree>Total Used</HeadingThree>
                    <HeadingFour>{totals.totalCutArea}</HeadingFour>
                  </MyDiv>
                  <MyDiv className="DashboardTopItemNotes">
                    <PTag>Total used area</PTag>
                  </MyDiv>
                </MyDiv>
              </Grid>
              <Grid item md={2.3}>
                <MyDiv className="DashboardTopItem" style={{marginBottom: '0'}}>
                  <SpanTag className="DashboardTopItemIcon">
                    <GiSteelClaws />
                  </SpanTag>
                  <MyDiv className="DashboardTopItemContent">
                    <HeadingThree>Total Product</HeadingThree>
                    <HeadingFour>{totals.totalProductArea}</HeadingFour>
                  </MyDiv>
                  <MyDiv className="DashboardTopItemNotes">
                    <PTag>Total product area</PTag>
                  </MyDiv>
                </MyDiv>
              </Grid>
              <Grid item md={2.3}>
                <MyDiv className="DashboardTopItem" style={{marginBottom: '0'}}>
                  <SpanTag className="DashboardTopItemIcon">
                    <ImStackoverflow />
                  </SpanTag>
                  <MyDiv className="DashboardTopItemContent">
                    <HeadingThree>Total Offcut</HeadingThree>
                    <HeadingFour>{parseFloat(totals.totalOffcutsArea).toFixed(3)}</HeadingFour>
                  </MyDiv>
                  <MyDiv className="DashboardTopItemNotes">
                    <PTag>Total Offcut area</PTag>
                  </MyDiv>
                </MyDiv>
              </Grid>
              <Grid item md={2.3}>
                <MyDiv className="DashboardTopItem" style={{marginBottom: '0'}}>
                  <SpanTag className="DashboardTopItemIcon">
                    <FiTrash2  />
                  </SpanTag>
                  <MyDiv className="DashboardTopItemContent">
                    <HeadingThree>Total Waste</HeadingThree>
                    <HeadingFour>{totals.totalWasteArea}</HeadingFour>
                  </MyDiv>
                  <MyDiv className="DashboardTopItemNotes">
                    <PTag>Total waste area</PTag>
                  </MyDiv>
                </MyDiv>
              </Grid>
              <Grid item md={2.3}>
                <MyDiv className="DashboardTopItem" style={{marginBottom: '0'}}>
                  <SpanTag className="DashboardTopItemIcon">
                    <RiPercentLine  />
                  </SpanTag>
                  <MyDiv className="DashboardTopItemContent">
                    <HeadingThree>Total Result</HeadingThree>
                    <HeadingFour>{totals.totalResult}</HeadingFour>
                  </MyDiv>
                  <MyDiv className="DashboardTopItemNotes">
                    <PTag>Total Result</PTag>
                  </MyDiv>
                </MyDiv>
              </Grid>
            </Grid>
            <Row>
              <Col md={12}>
                <MyDiv className="GeneralTable">
                  <CustomDataGrid
                    rows={hourlyData}
                    columns={getCurrentOffcutsColumns()}
                    loading={loading}
                    hideFooter={true}
                    gridHeight="calc(100vh - 400px)"
                    getRowClassName={getRowClassName}
                    sortingMode="server"
                    sortModel={sortModel}
                    onSortModelChange={handleSortModelChange}
                  />
                </MyDiv>
              </Col>
            </Row>
          </>
        )}

        {activeTab === 1 && (
          <Row>
            <Col md={12}>
              <MyDiv className="GeneralTable">
                <CustomDataGrid
                  rows={detailedReportData}
                  columns={getCurrentDetailedColumns()}
                  loading={loading}
                  hideFooter={true}
                  gridHeight="calc(100vh - 350px)"
                  getRowClassName={getRowClassName}
                  sortingMode="server"
                  sortModel={sortModel}
                  onSortModelChange={handleSortModelChange}
                />
              </MyDiv>
            </Col>
          </Row>
        )}

        {activeTab === 2 && (
          <>
            <Grid container className="DashboardTop mt-1" gap={1}>
              <Grid item md={3}>
                <MyDiv className="DashboardTopItem" style={{marginBottom: '0'}}>
                  <SpanTag className="DashboardTopItemIcon">
                    <FiPackage />
                  </SpanTag>
                  <MyDiv className="DashboardTopItemContent">
                    <HeadingThree>Total Pieces Folded</HeadingThree>
                    <HeadingFour>{foldTotals.totalPieces}</HeadingFour>
                  </MyDiv>
                  <MyDiv className="DashboardTopItemNotes">
                    <PTag>Total pieces folded in selected period</PTag>
                  </MyDiv>
                </MyDiv>
              </Grid>
            </Grid>
            <Row>
              <Col md={12}>
                <MyDiv className="GeneralTable">
                  <CustomDataGrid
                    rows={foldReportData}
                    columns={getCurrentFoldColumns()}
                    loading={loading}
                    hideFooter={true}
                    gridHeight="calc(100vh - 400px)"
                    getRowClassName={getRowClassName}
                    sortingMode="server"
                    sortModel={sortModel}
                    onSortModelChange={handleSortModelChange}
                  />
                </MyDiv>
              </Col>
            </Row>
          </>
        )}
      </React.Fragment>
    </React.Fragment>
  );
}

export default SWIMachineReport;