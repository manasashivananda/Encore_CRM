import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col  } from "react-bootstrap";
import { HeadingTwo, MyDiv, SpanTag } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import {  TextField, MenuItem, Button, IconButton, Typography, Card, CardContent } from "@mui/material";
import axios from 'axios';
import { modes, packs_pack_name, quantity } from '../Common/staticjson';
import html2canvas from 'html2canvas';
import { FiLoader } from 'react-icons/fi';
import BarcodeSection from '../Orders/barcodeSection';
import { MdMarkEmailRead } from "react-icons/md";
import { FaFilePdf } from "react-icons/fa6";
import CustomSwal from '../Common/customSwal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const AWF_CUST_ID = localStorage.getItem("awfCustId");

const API_TOKEN = localStorage.getItem("token");

function GenerateBarcode() {
    const wrapperRefs = {
        re_flashing: useRef(),
        re_jobbing: useRef(),
        re_facia_gutter: useRef(),
        re_cladding: useRef(),
        re_gbi: useRef(),
        re_roofing: useRef(),
      };

    let navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const inputRef = useRef(null);
    const scanTimeout = useRef(null);

    const [data, setData] = useState({
        mode: 1,
        order_no: "",
        department:"",
        packs: 1,
        pack_name: 1,
        quantity: 1,
    })

    const [totalQty, setTotalQty] = useState(null)

    const initialDept = {
            department_name: "Flashing",
            department_code: "F",
            department_status: "active",
        }

    const [customData, setCustomData] = useState({
        pack_value : "",
        pn_value : "",
        q_value: ""

    })
    const [departments, setDepartments] = useState([])
    const [barCodeList, setBarCodeList] = useState([]);
    const [barcodeSetLoading, setBarcodeSetLoading] = useState(false);
    const [filteredDept, setFilteredDept] = useState([])
    const [packVisualization, setPackVisualization] = useState([]);
    const [disableButton, setDisableButton] = useState(true)

    const loadDepartment = useCallback(async () => {
        const url = API_BASE_URL + `fetch-department-data`;
        axios.get(url, { headers: { 'x-access-token': localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })
            .then(res => {
                const activeData = res.data.filter((item) => item.department_status.toLowerCase() === 'active' && item.department_code.toLowerCase() !== "gbil")
                activeData.push(initialDept)
                setDepartments(activeData);
            })
            .catch(error => {
                CustomSwal.toast.info("Department fetching failed.")
            });
    },[])

    useEffect(() => {
        loadDepartment();
    }, [loadDepartment]);

    function splitQuantityEvenly(originalQuantity, packs, mode, manualQuantitiesRaw = '') {
        if (!Number.isInteger(originalQuantity) || !Number.isInteger(packs) || originalQuantity <= 0 || packs <= 0) {
            CustomSwal.toast.info("Both originalQuantity and packs must be positive integers.")
        }

        if (packs > originalQuantity) {
            CustomSwal.toast.info("Total Packs cannot be more than original quantity.")
            setDisableButton(true)
            return
        }

        if (mode === 3) {
            const manualQuantities = manualQuantitiesRaw
                .split(',')
                .map(q => parseInt(q.trim(), 10))
                .filter(q => !isNaN(q));

            const totalManual = manualQuantities.reduce((sum, q) => sum + q, 0);

            if (totalManual > originalQuantity || totalManual !== originalQuantity) {
                CustomSwal.toast.info("Total Quantity and Quantity split are not matching.")
                setDisableButton(true)
                return
            }

            if (manualQuantities.length !== packs) {
                CustomSwal.toast.info("Total Packs and Quantity split are not matching.")
                setDisableButton(true)
                return
            }
            setDisableButton(false)
            return manualQuantities;
        }

        if (mode === 1) {
            return new Array(packs).fill(originalQuantity);
        }

        // Default: Split Equally
        const baseQty = Math.floor(originalQuantity / packs);
        const result = new Array(packs).fill(baseQty);
        const remaining = originalQuantity - (baseQty * packs);

        for (let i = 0; i < remaining; i++) {
            result[i] += 1;
        }

        return result;
    }
    
    const loadSpecificBarcodeList = useCallback(async (dept = data.department, query=searchQuery) => {
        var url = API_BASE_URL + `fetch-specific-order-barcode-details/${query}`;
        try {
            const response = await fetch(url, {
            headers: {
                'x-access-token': localStorage.getItem("token"),
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            });
            const data = await response.json();
            setBarCodeList(data);
            const dataObj = data[0];
            if(dataObj?.Order_Cladding_Count !== 0 || dataObj?.Order_Flashing_Count !== 0 || dataObj?.Order_Faciagutter_Count !== 0 || dataObj?.Order_GBI_Count !== 0 || dataObj?.Order_Jobbing_Count !== 0 || dataObj?.Order_Roofing_Count !== 0){
                if(dept === "CL")
                    setTotalQty(dataObj?.Order_Cladding_Count)
                else if(dept === "F")
                    setTotalQty(dataObj?.Order_Flashing_Count)
                else if(dept === "FG")
                    setTotalQty(dataObj?.Order_Faciagutter_Count)
                else if(dept === "GBI")
                    setTotalQty(dataObj?.Order_GBI_Count)
                else if(dept === "J")
                    setTotalQty(dataObj?.Order_Jobbing_Count)
                else if(dept === "ROOF")
                    setTotalQty(dataObj?.Order_Roofing_Count)
            }
            const deptArray = []
            if(data.length){
                if(dataObj?.Order_Cladding_Count !== 0){
                    deptArray.push("CL")
                }
                if(dataObj?.Order_Flashing_Count !== 0){
                    deptArray.push("F")
                }
                if(dataObj?.Order_Faciagutter_Count !== 0){
                    deptArray.push("FG")
                }
                if(dataObj?.Order_GBI_Count !== 0){
                    deptArray.push("GBI")
                }
                if(dataObj?.Order_Jobbing_Count !== 0){
                    deptArray.push("J")
                }
                if(dataObj?.Order_Roofing_Count !== 0){
                    deptArray.push("ROOF")
                }
                const result = departments.filter(item =>
                    deptArray.includes(item.department_code)
                );
                setFilteredDept(result)
            }else{
                setFilteredDept([])
            }
        } catch (error) {
            CustomSwal.toast.info("Cannot load barcode details.")
        }
    },[data.department, searchQuery, departments]);

    useEffect(() => {
        searchQuery?.length && loadSpecificBarcodeList();
        setFilteredDept([])
    }, [searchQuery]);

    useEffect(() => {
        searchQuery?.length && loadSpecificBarcodeList(data.department);
    }, [data.department]);

    const packNames = []

    useEffect(() =>{
        setData({
            ...data,
            packs: 1,
            pack_name: 1,
            quantity: 1,
        })
        setCustomData({
            pack_value : "",
            pn_value : "",
            q_value: ""
        })
    },[data.mode])

    useEffect(() => {
        if(data.mode === 2 ){
            const totalPacks = parseInt(customData.pack_value) || totalQty;
            if (totalPacks > 0) {
                setDisableButton(false)
                try {
                    const packNames = customData.pn_value ? customData.pn_value.split(',').map(p => p.trim()) : [];
                    const quantities = splitQuantityEvenly(totalQty, totalPacks, data.quantity, customData.q_value);
                    const visualization = new Array(totalPacks).fill(null).map((_, i) => ({
                        pack: i + 1,
                        name: packNames.length ? ("Pack - " + (i + 1) + (totalQty > 1 && `/${totalPacks} (${packNames[i].toUpperCase()})`)) : ("Pack - " + (i + 1) + (totalQty > 1 && `/${totalPacks}`)),
                        quantity: quantities[i]
                    }));
                    if(packNames.length > totalPacks){
                        CustomSwal.toast.info("Total Packs and Pack Name split are not matching.")
                        setDisableButton(true)
                        return
                    }
                    setPackVisualization(visualization);
                } catch (err) {
                    setPackVisualization([]);
                }
            } else {
                setPackVisualization([]);
            }
        }

    }, [data.quantity, data.packs, customData.pack_value, customData.pn_value, customData.mode, customData.q_value, totalQty, data.department, data.mode]);

    
    const handleSaveAndSendToAPI = async (send_email = false) => {
        setBarcodeSetLoading(true);
        const canvasWidth = 1800;
        const canvasHeight = 1200;
        const opt = {
            scale: 4,
        };

        const formData = new FormData();
        let barcodeRefs = [];

        if (data.department === 'F') barcodeRefs = [wrapperRefs.re_flashing.current];
        else if (data.department === 'J') barcodeRefs = [wrapperRefs.re_jobbing.current];
        else if (data.department === 'FG') barcodeRefs = [wrapperRefs.re_facia_gutter.current];
        else if (data.department === 'CL') barcodeRefs = [wrapperRefs.re_cladding.current];
        else if (data.department === 'GBI') barcodeRefs = [wrapperRefs.re_gbi.current];
        else if (data.department === 'ROOF') barcodeRefs = [wrapperRefs.re_roofing.current];

        const totalGroups = parseInt(customData.pack_value || (data.mode === 2 && totalQty)) || 1;
        const customLabels = customData.pn_value
            ? customData.pn_value.split(',').map(s => s.trim().toUpperCase())
            : []; 
        const 
        quantities = splitQuantityEvenly(totalQty || 1, totalGroups, data.quantity, customData.q_value);

        // Create separate arrays for DOM nodes - DO NOT push to quantities!
        const labelNodes = [];
        const qtyNodes = [];
        for (let groupIndex = 0; groupIndex < totalGroups; groupIndex++) {
            const labelPrefix = `${groupIndex + 1}`;
            const packName = customLabels.length > 0 ? ` (${customLabels[groupIndex]})` : ""
            const label = `Pack - ${labelPrefix}/${totalGroups}${packName}`;
            const qtyLabel = quantities[groupIndex];

            for (let index = 0; index < barcodeRefs.length; index++) {
                const barcodeRef = barcodeRefs[index];

                // Find the original Pieces value element and replace it
                let originalPiecesElement = null;
                let originalPiecesValue = null;
                
                // Search for the element containing the total quantity (e.g., ":101" or "101")
                const allElements = barcodeRef.querySelectorAll('span, div, p, td');
                for (const el of allElements) {
                    const text = el.innerText?.trim();
                    // Match patterns like ":101", "101", ": 101"
                    if (text === String(totalQty) || 
                        text === `:${totalQty}` || 
                        text === `: ${totalQty}` ||
                        text.includes(`:${totalQty}`)) {
                        originalPiecesElement = el;
                        originalPiecesValue = el.innerText;
                        // Replace with pack quantity
                        if (totalGroups > 1) {
                            el.innerText = text.includes(':') ? `:${qtyLabel}` : String(qtyLabel);
                        }
                        break;
                    }
                }

                const labelNode = document.createElement('div');
                labelNode.innerText = label;
                labelNode.style.position = 'absolute';
                // labelNode.style.top = '150px';
                labelNode.style.top = barCodeList[0]?.account_UID === AWF_CUST_ID ? '270px': '150px';
                labelNode.style.left = '40px';
                labelNode.style.color = '#d22530';
                labelNode.style.background = 'transparent';
                labelNode.style.fontSize = '100px';
                labelNode.style.fontWeight = 'bold';
                labelNode.style.zIndex = '9999';

                barcodeRef.style.position = 'relative';

                if (totalGroups > 1) {
                    labelNodes.push(labelNode);
                    barcodeRef.appendChild(labelNode);
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));

                try {
                    const canvas = await html2canvas(barcodeRef, opt);
                    const resizedCanvas = document.createElement('canvas');
                    resizedCanvas.width = canvasWidth;
                    resizedCanvas.height = canvasHeight;
                    const ctx = resizedCanvas.getContext('2d');
                    ctx.drawImage(canvas, 0, 0, canvasWidth, canvasHeight);

                    const blob = await new Promise((resolve) =>
                        resizedCanvas.toBlob(resolve, 'image/jpeg', 0.9)
                    );

                    formData.append('documents', blob, `group_${groupIndex}_barcode_${index + 1}.jpg`);
                } catch (error) {
                    console.error('Error capturing barcode:', error);
                } finally {
                    // Restore original Pieces value after capture
                    if (originalPiecesElement && originalPiecesValue !== null) {
                        originalPiecesElement.innerText = originalPiecesValue;
                    }
                    if (totalGroups > 1) {
                        barcodeRef.removeChild(labelNode);
                    }
                }
            }
        }

        const apiEndpoint = `${API_BASE_URL}sent-barcode-pdf-for-printing/${searchQuery}/${data.department}/${send_email}`;
        try {
            const res = await axios.post(apiEndpoint, formData, {
                responseType: 'arraybuffer',
                headers: {
                    'x-access-token': localStorage.getItem("token"),
                    Accept: 'application/json',
                },
            });

            if (res.status === 200) {
                CustomSwal.toast.success(res.data?.message || "Barcode sticker processed")
            }

            if (!send_email) {
                const blob = new Blob([res.data], { type: res.headers['content-type'] });
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank');
                // optionally later revoke
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            }
            setBarcodeSetLoading(false);
        } catch (error) {
            CustomSwal.toast.error(error?.response?.data || "Something went wrong!")
            setBarcodeSetLoading(false);
        } finally {
            setBarcodeSetLoading(false);
        }
    };


    const handleChange = (e) =>{
        const {name, value} = e.target
        setData({
            ...data,
            [name] : value
        })
    }

    const handleChangeCustomData = (e) =>{
        const {name, value} = e.target
        setCustomData({
            ...customData,
            [name] : value
        })
    }

    
    const onSubmit = async (e) =>{
        e.preventDefault()
        await handleSaveAndSendToAPI()
    }

    const sendEmail = async () => {
        await handleSaveAndSendToAPI(true)
    }

    const handleNumericInput = (e, setStateCallback, maxValue = null) => {
        const value = e.target.value;

        if (!/^\d*$/.test(value)) return; // restrict to digits only

        if (maxValue !== null && parseInt(value || '0', 10) > maxValue) return;

        setStateCallback(prev => ({
            ...prev,
            pack_value: value
        }));
    };

    useEffect(() =>{
        // setDisableButton(false)
        if(data.mode === 2 && (customData.pack_value > totalQty)){
            setDisableButton(true)
            CustomSwal.toast.error("Packs cannot be more than original quantity.")
        }
        if(data.department && searchQuery && data.mode){
            setDisableButton(false)
        }else{
            setDisableButton(true)
        }
    },[data.mode, data.department, searchQuery])

    const handleScan = (query) => {
        loadSpecificBarcodeList(data.department, query);
    };

    useEffect(() => {
        if (searchQuery) {
            clearTimeout(scanTimeout.current);
            scanTimeout.current = setTimeout(() => handleScan(searchQuery), 400);
        }
        return () => clearTimeout(scanTimeout.current);
    }, [searchQuery.length === 8]);

    useEffect(() => {
        document.addEventListener("keydown", () => inputRef.current?.focus());
        return () => document.removeEventListener("keydown", () => inputRef.current?.focus());
    }, []);
    

    return (
        <React.Fragment>
            {barcodeSetLoading ? 
                <MyDiv className="BulkUploadLoader">
                    <SpanTag>
                        <IconButton aria-label="fingerprint" color="info" className='IconBtnLoader'>
                            <FiLoader /> 
                        </IconButton><br />
                        Generating Barcode PDF  <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
                    </SpanTag> 
                </MyDiv> : 
            ""}
            <Row className="GeneralHeading withBackArrow">
                    <HeadingTwo>
                        <Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>
                        Manage Barcode Generator
                    </HeadingTwo>
            </Row>
            <form onSubmit={(e) => onSubmit(e)}>
                <Row className="DrawerFormField GeneralHeading mt-3">
                <Col md={3}>
                    <TextField
                        id='mode'
                        required
                        name='mode'
                        label="Mode"
                        fullWidth
                        select
                        value={data.mode}
                        onChange={(e) => {
                            handleChange(e)
                            setCustomData({
                                pack_value : "",
                                pn_value : "",
                                q_value : ""
                            })
                        }}
                    >
                        {modes.map((mode, index) =>(
                            <MenuItem key={index} value={mode.value}>{mode.label}</MenuItem>
                        ))}
                    </TextField>
                </Col>
                <Col md={3}>
                    <BarcodeScanner searchQuery={searchQuery} setSearchQuery={setSearchQuery} inputRef={inputRef}/>
                </Col>
                <Col md={2}>
                    <TextField
                        id='department'
                        name='department'
                        label="Department"
                        fullWidth
                        select
                        variant='standard'
                        required
                        value={data.department}
                        onChange={(e) => handleChange(e)}
                    >
                        {(filteredDept).map((department, index) =>(
                            <MenuItem key={index} value={department.department_code}>{department.department_name}</MenuItem>
                        ))}
                    </TextField>
                </Col>
                <Col md={2}>
                    <Button type='submit' disabled={disableButton} className="btn primary-btn" size='large' variant='primary' endIcon={<FaFilePdf />}>Generate</Button>
                </Col>
                <Col md={2} style={{ textAlign : "right" }}>
                    <Button className="btn primary-btn" endIcon={<MdMarkEmailRead />} disabled={disableButton} variant='primary' onClick={() => sendEmail()}>Send</Button>
                </Col>
            </Row>
            {data.mode === 2 && totalQty && searchQuery && data.department &&
                <>
                    <Row className="GeneralHeading mt-2">
                        <Typography variant='h5'>Total Quantity : {totalQty}</Typography>
                        {packVisualization.map((box, idx) => (
                            <Col md={2}>
                                <Card key={idx} style={{ backgroundColor : '#cb9f77' }} className='mt-2'>
                                    <CardContent sx={{ height: '100%', display: 'flex' }}>
                                        <MyDiv >
                                            <img src={require('../../Assets/images/EncoreSheetMetalLogo.png')} width={"60%"} alt="logo" />
                                        </MyDiv>
                                        <MyDiv>
                                            <Typography variant="body1" component="div">
                                                {box.name}
                                            </Typography>
                                            <Typography variant="body1" color="div">
                                                Pcs : {box.quantity}
                                            </Typography>
                                        </MyDiv>
                                    </CardContent>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                    <Row className="GeneralHeading mt-2">
                        <Col md={4}>
                            <Row>
                                <Col md={12}>
                                    <TextField
                                        id='packs'
                                        name='packs'
                                        label="Packs"
                                        fullWidth
                                        select
                                        focused
                                        value={data.packs}
                                        onChange={(e) => { 
                                            handleChange(e) 
                                            setCustomData({...customData, "pack_value" : "", "pn_value" : ""})
                                        }}
                                    >
                                        {packs_pack_name.map((mode, index) =>(
                                            <MenuItem key={index} value={mode.value}>{mode.label}</MenuItem>
                                        ))}
                                    </TextField>
                                </Col>
                                {data.packs === 2 &&
                                    <Col md={12} className='mt-2'>
                                        <TextField
                                            id='pack_value'
                                            name='pack_value'
                                            label="Values"
                                            fullWidth
                                            focused
                                            // type='number'
                                            value={customData.pack_value}
                                            onInput={(e) => handleNumericInput(e, setCustomData, totalQty)}
                                            onChange={(e) => 
                                                {
                                                    handleChangeCustomData(e)
                                                    
                                                }
                                            }
                                        />
                                    </Col>
                                }
                            </Row>
                        </Col>
                        
                        <Col md={4}>
                            <Row>
                                <Col md={12}>
                                    <TextField
                                        id='pack_name'
                                        name='pack_name'
                                        label="Pack Name"
                                        fullWidth
                                        focused
                                        select
                                        value={data.pack_name}
                                        onChange={(e) => {
                                            handleChange(e)
                                            setCustomData({...customData, "pn_value" : ""})
                                        }}
                                    >
                                        {packs_pack_name.map((mode, index) =>(
                                            <MenuItem key={index} value={mode.value}>{mode.label}</MenuItem>
                                        ))}
                                    </TextField>
                                </Col>
                                {data.pack_name === 2 && 
                                    <Col md={12} className='mt-2'>
                                        <TextField
                                            id='pn_value'
                                            name='pn_value'
                                            label="Values"
                                            fullWidth
                                            focused
                                            value={customData.pn_value}
                                            placeholder='Enter comma separated values'
                                            onChange={(e) => handleChangeCustomData(e)}
                                        />
                                    </Col>
                                }
                            </Row>
                        </Col>

                        <Col md={4}>
                            <Row>
                                <Col md={12}>
                                    <TextField
                                        id='quantity'
                                        name='quantity'
                                        label="Quantity"
                                        focused
                                        fullWidth
                                        select
                                        value={data.quantity}
                                        onChange={(e) => handleChange(e)}
                                    >
                                        {quantity.map((mode, index) =>(
                                            <MenuItem key={index} value={mode.value}>{mode.label}</MenuItem>
                                        ))}
                                    </TextField>
                                </Col>
                                {data.quantity === 3 && 
                                    <Col md={12} className='mt-2'>
                                        <TextField
                                            id='q_value'
                                            name='q_value'
                                            label="Values"
                                            fullWidth
                                            focused
                                            placeholder='Enter comma separated values'
                                            value={customData.q_value}
                                            onChange={(e) => handleChangeCustomData(e)}
                                        />
                                    </Col>
                                }
                            </Row>
                        </Col>
                    </Row>
                </>
            }
            </form>
                 {barCodeList.map((item) => (        
                    <MyDiv key={item._id} className="barcodeHideSection">          
                        <Row>
                            {item.Order_Flashing_Count !== 0 && (
                            <BarcodeSection item={item} department="Flashing"  barcodeRef={wrapperRefs.re_flashing} />
                            )}
                            {item.Order_Jobbing_Count !== 0 && (
                            <BarcodeSection item={item}  department="Jobbing" barcodeRef={wrapperRefs.re_jobbing} />
                            )}
                            {item.Order_Faciagutter_Count !== 0 && (
                            <BarcodeSection item={item}  department="Facia Gutter"  barcodeRef={wrapperRefs.re_facia_gutter}  />
                            )}
                            {item.Order_Cladding_Count !== 0 && (
                            <BarcodeSection item={item} department="Cladding" barcodeRef={wrapperRefs.re_cladding} />
                            )}
                            {item.Order_GBI_Count !== 0 && (
                            <BarcodeSection item={item} department="GBI" barcodeRef={wrapperRefs.re_gbi} />
                            )}
                            {item.Order_Roofing_Count !== 0 && (
                            <BarcodeSection item={item} department="Roofing" barcodeRef={wrapperRefs.re_roofing} />
                            )}
                        </Row>
                        </MyDiv>
                    ))
            }
        </React.Fragment>
    );
}

export const BarcodeScanner = ({ searchQuery, setSearchQuery }) => {
    // whenever I click on other input field, this input should not be focused
  const barcodeInputRef = useRef(null);
  const handleClickOutside = (event) => {
    if (
      barcodeInputRef.current &&
      !barcodeInputRef.current.contains(event.target) &&
      event.target.tagName !== 'INPUT' // Exclude other input fields
    ) {
        barcodeInputRef.current.focus();
    }
  };

  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
      <form>
        <TextField
            inputRef={barcodeInputRef}
            type='text'
            label="Order Number"
            fullWidth
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.trim())} onKeyDown={(e) => {if (e.key === 'Enter') { e.preventDefault();}  }}
            placeholder='Scan or Type the Order Number'
            focused
            variant='standard'
        />
        {/* <input ref={barcodeInputRef} autoFocus type="text" placeholder="Scan Order No" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value.trim())} onKeyDown={(e) => {if (e.key === 'Enter') { e.preventDefault();}  }}/> */}
      </form>
  );
};

export default GenerateBarcode;