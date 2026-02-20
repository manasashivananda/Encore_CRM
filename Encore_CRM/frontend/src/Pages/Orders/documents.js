import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Badge, Spinner } from "react-bootstrap";
import { MyDiv, SpanTag } from "../Common/Components";
import { Dialog, DialogTitle, DialogContent, Button, DialogActions, Tooltip, IconButton } from '@mui/material';
import NoDataFound from '../Common/noDataFound';
import { MdDescription, MdDelete } from "react-icons/md";
import axios from 'axios';
import swal from "sweetalert2";
import { GrDocumentTxt, GrDocumentPdf } from "react-icons/gr";
import { TbFileTypeXls } from "react-icons/tb";
import PropTypes from "prop-types";
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;



function OrderDocuments({ selectedImages, orderUpdates, CoreOrder, department }) {
    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
    const API_TOKEN = localStorage.getItem("token");
    const RolePermission = JSON.parse(localStorage.getItem('role'));
    //console.log('CoreOrder', CoreOrder);
    let { id } = useParams();
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [currentSelectedImages, setSelectedImages] = useState(selectedImages);
    const [orderDepartmentImages, setOrderDepartmentImages] = useState('');
    const [btnLoading, setBtnLoading] = useState(false);
    const [pdfloading, setPdflLoading] = useState(false);
    const handleOpenDialog = () => {
        loadOrderDepartmentImages();
        setOpenDialog(true);
        setSelectedFiles([]);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setOrderDepartmentImages();
    };

    const loadOrderDepartmentImages = useCallback(async () => {
    const url = `${API_BASE_URL}fetch-specific-order-design-images/${id}/${department}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setOrderDepartmentImages(res.data);
    } catch (error) {
      console.log(error);
    }
  }, [id, department]);

    useEffect(() => {
        loadOrderDepartmentImages();
    }, [department]);

    const handleDeleteImage = async index => {
        const url = `${API_BASE_URL}delete-specific-order-design-images/${id}/${department}/${index}`;
        try {
        const response = await axios.delete(
            url,

            {
            headers: {
                "x-access-token": localStorage.getItem("token"),
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            }
        );
        setOpenDialog(false);
        swal.fire({
            text: response.data || "Image deleted successfully",
            icon: "success",
        });
        orderUpdates();
        } catch (error) {
        setOpenDialog(false);
        swal.fire({
            text: error.response.data,
            icon: "error",
        });
        }
    };

    const handleFileSelect = (e) => {
        setSelectedFiles(Array.from(e.target.files));
    };

    const handleSubmit = e => {
        e.preventDefault();
        setBtnLoading(true);
        const formData = new FormData();
        selectedFiles.forEach(file => {
        formData.append("documents", file);
        });

        const url = API_BASE_URL + "update-specific-order-design-images/" + id + "/" + department;

        axios
        .put(url, formData, {
            headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "multipart/form-data",
            },
        })
        .then(res => {
            if (res.status === 200) {
            setOpenDialog(false);
            swal.fire({
                text: "Successfully Saved",
                icon: "success",
            });
            orderUpdates();
            }
        })
        .catch(error => {
            swal.fire({
            text: error.response?.data || "An error occurred",
            icon: "error",
            });
        })
        .finally(() => {
            setBtnLoading(false);
        });
    };

    const getFileType = (url) => {
        const urlWithoutQuery = url.split('?')[0];
        const extension = urlWithoutQuery.split('.').pop().toLowerCase();
        switch (extension) {
            case 'png':
            case 'jpeg':
            case 'jpg':
            case 'gif':
                return 'image';
            case 'pdf':
                return 'pdf';
            case 'doc':
            case 'docx':
                return 'doc';
            case 'xlsx':
                return 'xlsx';
            default:
                return 'unknown';
        }
    };

    const departmentLabels = {
        'F': 'Flashing',
        'FG': 'Fascia Gutter',
        'J': 'Jobbing',
        'CL': 'Cladding',
        'GBI': 'GBI',
        'ROOF': 'Roofing',
    };

    const renderImagesByDepartment = (depImages) => {
        // console.log(depImages);
        if (depImages.length) {
            return depImages.map((depImage, index) => {
                const fileType = getFileType(depImage.url);
                return (
                    <Col key={index} md={3} className="mb-3">
                        <MyDiv>
                            <SpanTag className="text-center">
                                {fileType === 'image' && (
                                    <img src={depImage.url} alt={`Order Image ${index + 1}`} />
                                )}
                                {fileType === 'pdf' && (
                                    <GrDocumentPdf className='DocIcon' />
                                )}
                                {fileType === 'doc' && (
                                    <GrDocumentTxt className='DocIcon' />
                                )}
                                {fileType === 'xlsx' && (
                                    <TbFileTypeXls className='DocIcon' />
                                )}
                                {fileType === 'unknown' && (
                                    <span>Unknown file type for Order {index + 1}</span>
                                )}
                            </SpanTag>

                            <Tooltip title="Delete Image">
                                <IconButton aria-label="delete" color="secondary" onClick={() => handleDeleteImage(index)}><MdDelete /></IconButton>
                            </Tooltip>

                            <a href={depImage.url} download target="_blank" rel="noopener noreferrer" title='Download'>Download</a>
                        </MyDiv>
                    </Col>
                );
            });
        }
        return null;
    };

const downloadDrawingsPDF = async () => {
    setPdflLoading(true);
    try {
        console.log("id", id);
        
        // Delete existing system-generated PDFs before creating new one
        if (orderDepartmentImages && orderDepartmentImages?.imageUrls.length > 0) {
            // Create array to store indices to delete (in reverse order to avoid index shifting issues)
            const indicesToDelete = [];
            
            orderDepartmentImages.imageUrls.forEach((imageObj, index) => {
                const imageUrl = imageObj.url;
                // Extract filename from the full path (after the UUID)
                // Pattern: October-2025/uuid-Drawings_orderId_timestamp.pdf
                const urlParts = imageUrl.split('/');
                const filename = urlParts[urlParts.length - 1];
                
                // Check if filename contains 'Drawings_' after the UUID prefix
                // This identifies system-generated PDFs
                if (filename.includes('-Drawings_')) {
                    indicesToDelete.push(index);
                }
            });
            
            // Delete in reverse order to maintain correct indices
            for (let i = indicesToDelete.length - 1; i >= 0; i--) {
                const index = indicesToDelete[i];
                try {
                    await axios.delete(
                        `${API_BASE_URL}delete-specific-order-design-images/${id}/${department}/${index}`,
                        {
                            headers: {
                                'x-access-token': API_TOKEN,
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                            },
                        }
                    );
                    console.log(`Deleted existing system-generated PDF at index ${index}`);
                } catch (deleteError) {
                    console.warn(`Failed to delete PDF at index ${index}:`, deleteError);
                    // Continue with generation even if delete fails
                }
            }
            
            // Reload images after deletion if any were deleted
            if (indicesToDelete.length > 0) {
                await loadOrderDepartmentImages();
            }
        }
        
        const apiUrl = `${API_BASE_URL}api/templates/get-system-generated-drawing/${id}`;
        
        // Request the PDF as a blob
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'x-access-token': API_TOKEN,
                'Accept': 'application/pdf',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to generate drawings PDF');
        }

        console.log('PDF generation response:', response);
        console.log('Content-Type:', response.headers.get('content-type'));

        const pdfBlob = await response.blob();
        console.log("blob", pdfBlob);
        console.log("blob type:", pdfBlob.type);
        console.log("blob size:", pdfBlob.size);

        // Validate that we got a PDF
        if (pdfBlob.size < 1000) {
            const text = await pdfBlob.text();
            console.error('Received small response:', text);
            throw new Error('Invalid PDF received from server');
        }

        // Create FormData and append the PDF blob
        const formData = new FormData();
        formData.append('documents', pdfBlob, `Drawings_${id}_${Date.now()}.pdf`);

        // Upload the PDF file
        const uploadUrl = `${API_BASE_URL}update-specific-order-design-images/${id}/${department}`;
        await axios.put(uploadUrl, formData, {
            headers: {
                'x-access-token': API_TOKEN,
                'Accept': 'application/json',
                'Content-Type': 'multipart/form-data',
            },
        });

        if (RolePermission && RolePermission.SWICopy && RolePermission.SWICopy.view === "1" && RolePermission.CustomerCopy && RolePermission.CustomerCopy.view === "1") {
            setOpenDialog(true);
            swal.fire({
                text: "Successfully Saved",
                icon: "success",
                timer: 1000,
            });
            loadOrderDepartmentImages();
            orderUpdates();
        }
        else {
            setOpenDialog(false);
            swal.fire({
                text: "Successfully Saved",
                icon: "success",
                timer: 1000,
            });
            orderUpdates();
        }

    } catch (err) {
        console.error('Error generating or uploading drawings PDF:', err);
        swal.fire({
            text: err.message || 'Failed to generate or upload PDF',
            icon: 'error',
        });
    } finally {
        setPdflLoading(false);
    }
};

    return (
        <React.Fragment>
            <Tooltip title="Documents" className='ms-2 me-2'>
                <IconButton aria-label="fingerprint" sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", '&:hover': { backgroundColor: "#135c19" } }} onClick={(e) => handleOpenDialog()} >
                    <MdDescription />
                </IconButton>
            </Tooltip>
            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" className="GeneralModal">
                <DialogTitle className='space-between'> {departmentLabels[department] ? `${departmentLabels[department]} -` : ''} Item Documents  <Button onClick={handleCloseDialog} className="btn"> X </Button></DialogTitle>
                <DialogContent>
                    <MyDiv className="documentContainer">
                        <Row>
                            {orderDepartmentImages && orderDepartmentImages?.imageUrls.length > 0 ? (
                                <>
                                    {renderImagesByDepartment(orderDepartmentImages.imageUrls)}
                                </>
                            ) : (
                                <NoDataFound />
                            )}
                        </Row>
                    </MyDiv>
                </DialogContent>
                <DialogActions className='d-flex justify-content-start flex-column'>
                    <Row className='dialogFooter'>
                        {/* {RolePermission && RolePermission.CustomerCopy && RolePermission.CustomerCopy.view === "1" ? ( */}
                        <Col md={6} className=''>
                            <form onSubmit={handleSubmit}>
                                <MyDiv className="mb-2">
                                    <input type="file" id="document" name="document" multiple onChange={handleFileSelect} />
                                    <Button className='btn primary-btn mb-1' type="submit" disabled={btnLoading || !selectedFiles.length}>
                                        {btnLoading ? <Spinner animation="border" size="sm" /> : "Upload"}
                                    </Button>
                                </MyDiv>
                            </form>
                            {CoreOrder && CoreOrder.order_myob_push_status === true && (
                                <MyDiv><Badge pill className='orderMovedToProdBtn mb-3'>Order Data's sent to MYOB</Badge></MyDiv>
                            )}
                        </Col>
                        {/* ) : null} */}
                        {/* {RolePermission && RolePermission.SWICopy && RolePermission.SWICopy.view === "1" ? (
                        <Col md={6} className={RolePermission && RolePermission.CustomerCopy && RolePermission.CustomerCopy.view === "0" ? 'd-flex justify-content-start mb-2' : 'd-flex justify-content-end mb-2'}>
                            { department === 'F' && (
                            <Button onClick={() => downloadDrawingsPDF()} className="btn primary-btn" style={{ whiteSpace: 'nowrap', marginRight: '10px' }}>
                                {pdfloading ? (
                                    <>
                                    <span>Generating PDF...</span>
                                    </>
                                ) : (
                                    <>
                                    <span>Attach System Generated PDF</span>
                                    </>
                                )}
                            </Button>)}
                        </Col>) : null} */}
                    </Row>
                </DialogActions>
            </Dialog>
        </React.Fragment>
    );
}

OrderDocuments.propTypes = {
    selectedImages: PropTypes.array,
    orderUpdates: PropTypes.func.isRequired,
    CoreOrder: PropTypes.object,
    department: PropTypes.string.isRequired
};

export default OrderDocuments;
