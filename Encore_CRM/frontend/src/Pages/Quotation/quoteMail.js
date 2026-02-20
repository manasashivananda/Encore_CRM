import React, { useState } from 'react';
import { Row, Col, Spinner } from "react-bootstrap";
import { MyDiv, } from "../Common/Components";
import { Dialog, DialogTitle, DialogContent, Button, Tooltip, IconButton, TextField } from '@mui/material';
import swal from "sweetalert2";
import axios from 'axios';
import { MdAttachEmail } from "react-icons/md";


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function QuoteMail({ CoreQuoterId }) {
    const [openDialog, setOpenDialog] = useState(false);
    const [printQuoteBtnLoading, setPrintQuoteBtnLoading] = useState(false);
    const [btnLoading, setBtnLoading] = useState(false);

    const [data, setData] = useState({
        quote_emailId: "",
        quote_emailBody: "",
    })

    const handleOpenDialog = () => {
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    function handle(e) {
        const newData = { ...data };
        newData[e.target.id] = e.target.value;
        setData(newData);
    }


    const submit = (e) => {
        e.preventDefault();
        setBtnLoading(true);
        const url = API_BASE_URL + `generate-quotation-docket/${CoreQuoterId}`;
        const method = 'post';
        axios({
            method,
            url,
            data,
            headers: {
                "x-access-token": localStorage.getItem("token"),
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        })
            .then((res) => {
                if (res.status === 200) {
                    swal.fire({
                        text: "Successfully Saved",
                        icon: "success",
                        type: "success"
                    });
                    setOpenDialog(false);
                }
                setBtnLoading(false);
                setData("");
            })
            .catch((error) => {
                swal.fire({
                    text: error.response.data,
                    icon: "error",
                    type: "error"
                });
                setBtnLoading(false);
            });
    };

    return (
        <React.Fragment>
            <Tooltip title="Send to Customer">
                <IconButton aria-label="fingerprint" color="warning" onClick={handleOpenDialog} disabled={printQuoteBtnLoading} >
                    {printQuoteBtnLoading ? <Spinner animation="border" size="sm" /> : <MdAttachEmail />}
                </IconButton>
            </Tooltip>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" className="GeneralModal">
                <DialogTitle>Send to Customer <Button onClick={handleCloseDialog} className="btn"> X </Button></DialogTitle>
                <DialogContent className='dialogContainer'>
                    <MyDiv className="ModelForm">
                        <form onSubmit={(e) => submit(e)}>
                            <Row className="DrawerFormField">
                                <Col md={12}>
                                    <TextField type='email' required id="quote_emailId" label="Email id" value={data.quote_customer_PO_number} variant="standard" onChange={(e) => handle(e)} sx={{ "& .MuiInputBase-input.Mui-disabled": { WebkitTextFillColor: "#000000" } }} />
                                </Col>
                                <Col md={12}>
                                    <TextField required id="quote_emailBody" multiline rows={4} label="Email Body Content" value={data.quote_emailBody} variant="standard" onChange={(e) => handle(e)} sx={{ "& .MuiInputBase-input.Mui-disabled": { WebkitTextFillColor: "#000000" } }} />
                                </Col>

                                <Col md={12} className="text-end">
                                    {btnLoading ? (
                                        <Button variant="primary" disabled className='mt-4 w-100'>
                                            <span aria-live="polite" className="d-inline-flex align-items-center">
                                                <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                                                <span className="visually-hidden">Please wait...</span>
                                            </span>
                                        </Button>
                                    ) : (
                                        <button type="submit" className="FormBtn">Send</button>
                                    )}
                                </Col>
                            </Row>
                        </form>
                    </MyDiv>
                </DialogContent>
            </Dialog>
        </React.Fragment >
    );
}

export default QuoteMail;
