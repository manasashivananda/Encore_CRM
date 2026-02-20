import React, { useState } from 'react';
import { Row, Col } from "react-bootstrap";
import { LabelTag, MyDiv } from "../Common/Components";
import { Dialog, DialogTitle, DialogContent, Button, DialogActions, TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Tooltip, IconButton } from '@mui/material';
import NoDataFound from '../Common/noDataFound';
import swal from "sweetalert2";
import axios from 'axios';
import moment from 'moment';
import { MdOutlineTrackChanges } from "react-icons/md";


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function QuoteTracking({ CoreQuoteId }) {
    const [openDialog, setOpenDialog] = useState(false);
    const [quoteTracking, setQuoteTracking] = useState('');

    const loadSpecificQuoteTracking = async () => {
        const url = API_BASE_URL + `fetch-quote-full-user-tracking/` + CoreQuoteId;
        axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })
            .then(res => {
                setQuoteTracking(res.data)
            })
            .catch(error => {
                swal.fire({
                    text: error.response.data,
                    icon: "error",
                    type: "error"
                });
            });
    }
    const handleOpenDialog = () => {
        loadSpecificQuoteTracking();
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    return (
        <React.Fragment>
            <Tooltip title="Tracking">
                <IconButton aria-label="fingerprint" color="success" className='ColoredIcon' onClick={handleOpenDialog} >
                    <MdOutlineTrackChanges />
                </IconButton>
            </Tooltip>
            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" className="GeneralModal">
                <DialogTitle>Quote Tracking</DialogTitle>
                <DialogContent className='dialogContainer'>
                    <MyDiv className="GeneralTable">
                        <TableContainer>
                            <Table className='bgGrey' aria-label="Quote table">
                                <TableHead>
                                    <TableRow>
                                        <TableCell align="left">Department</TableCell>
                                        <TableCell align="left">Employee Name</TableCell>
                                        <TableCell align="left">Taken Date & time</TableCell>
                                        <TableCell align="left">End  Date & time</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {quoteTracking && quoteTracking.length > 0 ? (
                                        quoteTracking.map((item, index) => (<>
                                            <TableRow >
                                                <TableCell align="left">
                                                    <LabelTag>Quote Created</LabelTag>
                                                </TableCell>
                                                <TableCell align="left">
                                                    {item.creator_Name}
                                                </TableCell>
                                                <TableCell align="left">
                                                    {moment(item.created).format('DD-MM-YYYY hh:mm a')}
                                                </TableCell>
                                                <TableCell align="left">
                                                    -
                                                </TableCell>
                                            </TableRow>
                                            {item.designer_Name ? <>
                                                <TableRow >
                                                    <TableCell align="left">
                                                        <LabelTag>Designer</LabelTag>
                                                    </TableCell>
                                                    <TableCell align="left">
                                                        {item.designer_Name}
                                                    </TableCell>
                                                    <TableCell align="left">
                                                        {item.quote_design_assigned_time ? moment(item.quote_design_assigned_time).format('DD-MM-YYYY hh:mm a') : null}
                                                    </TableCell>
                                                    <TableCell align="left">
                                                        {item.quote_design_completed_time ? moment(item.quote_design_completed_time).format('DD-MM-YYYY hh:mm a') : null}
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow >
                                                    <TableCell align="left">
                                                        <LabelTag>Quality Checker</LabelTag>
                                                    </TableCell>
                                                    <TableCell align="left">
                                                        {item.qc_Name}
                                                    </TableCell>
                                                    <TableCell align="left">
                                                        {item.quote_qc_assigned_time ? moment(item.quote_qc_assigned_time).format('DD-MM-YYYY hh:mm a') : null}
                                                    </TableCell>
                                                    <TableCell align="left">
                                                        {item.quote_qc_completed_time ? moment(item.quote_qc_completed_time).format('DD-MM-YYYY hh:mm a') : null}
                                                    </TableCell>
                                                </TableRow>
                                            </> : null}
                                        </>
                                        ))
                                    ) : (
                                        <TableRow colspan={4}>
                                            <NoDataFound />
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </MyDiv>
                </DialogContent>
                <DialogActions>
                    <Row className='dialogFooter'>
                        <Col md={12} className='d-flex justify-content-end'>
                            <Button onClick={handleCloseDialog} className="btn primary-btn mb-2"> Close </Button>
                        </Col>
                    </Row>
                </DialogActions>
            </Dialog>
        </React.Fragment >
    );
}

export default QuoteTracking;
