import React, { useState } from "react";
import { Row, Col } from "react-bootstrap";
import { LabelTag, MyDiv, StrongTag } from "../Common/Components";
import { Dialog, DialogTitle, DialogContent, Button, DialogActions, TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Tooltip, IconButton } from "@mui/material";
import NoDataFound from "../Common/noDataFound";
import swal from "sweetalert2";
import axios from "axios";
import moment from "moment";
import { MdOutlineTrackChanges } from "react-icons/md";
import PropTypes from "prop-types";


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function OrderTracking({ CoreOrderId }) {
  const [openDialog, setOpenDialog] = useState(false);
  const [orderTracking, setOrderTracking] = useState("");

  const loadSpecificOrderTracking = async () => {
    const url = API_BASE_URL + `fetch-order-full-user-tracking/` + CoreOrderId;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setOrderTracking(res.data);
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      });
  };
  const handleOpenDialog = () => {
    loadSpecificOrderTracking();
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  return (
    <React.Fragment>
      <Tooltip title="Tracking" >
        <IconButton
          aria-label="fingerprint"
          color="success"
          sx={{ color: "#fff", width: "35px", height: "35px", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }}
          className="ColoredIcon"
          onClick={handleOpenDialog}
        >
          <MdOutlineTrackChanges />
        </IconButton>
      </Tooltip>
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" className="GeneralModal">
        <DialogTitle>Order Tracking</DialogTitle>
        <DialogContent className="dialogContainer">
          <MyDiv className="GeneralTable">
            <TableContainer>
              <Table className="bgGrey" aria-label="Order table">
                <TableHead>
                  <TableRow>
                    <TableCell align="left">Department</TableCell>
                    <TableCell align="left">Employee Name</TableCell>
                    <TableCell align="left">Taken Date & time</TableCell>
                    <TableCell align="left">End Date & time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderTracking && orderTracking.length > 0 ? (
                    orderTracking.map((item, index) => (
                      <>
                        <TableRow key={index}>
                          <TableCell align="left">
                            <LabelTag>Order Created</LabelTag>
                          </TableCell>
                          <TableCell align="left">{item.creator_Name}</TableCell>
                          <TableCell align="left">{moment(item.created).format("DD-MM-YYYY hh:mm a")}</TableCell>
                          <TableCell align="left">-</TableCell>
                        </TableRow>
                        {item.designer_Name ? (
                          <>
                            <TableRow>
                              <TableCell align="left">
                                <LabelTag>Designer</LabelTag>
                              </TableCell>
                              <TableCell align="left">{item.designer_Name}</TableCell>
                              <TableCell align="left">{item.order_design_assigned_time != null ? moment(item.order_design_assigned_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              <TableCell align="left">{item.order_design_completed_time != null ? moment(item.order_design_completed_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell align="left">
                                <LabelTag>Quality Checker</LabelTag>
                              </TableCell>
                              <TableCell align="left">{item.qc_Name}</TableCell>
                              <TableCell align="left">{item.order_qc_assigned_time != null ? moment(item.order_qc_assigned_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              <TableCell align="left">{item.order_qc_completed_time != null ? moment(item.order_qc_completed_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                            </TableRow>
                          </>
                        ) : null}
                        {item.order_item_qc_user && 
                          <TableRow>
                              <TableCell align="left">
                                  <LabelTag>Primary QC</LabelTag>
                              </TableCell>
                              <TableCell align="left">
                                  {item.order_item_qc_user}
                              </TableCell>
                              <TableCell align="left">
                                  -
                              </TableCell>
                              <TableCell align="left">
                                  -
                              </TableCell>
                          </TableRow>
                          }
                          {item.w_order_item_qc_user && 
                          <TableRow>
                              <TableCell align="left">
                                  <LabelTag>Secondary QC</LabelTag>
                              </TableCell>
                              <TableCell align="left">
                                  {item.w_order_item_qc_user}
                              </TableCell>
                              <TableCell align="left">
                                  -
                              </TableCell>
                              <TableCell align="left">
                                  -
                              </TableCell>
                          </TableRow>
                          }
                        {item.myob_pusher_Name ? (
                          <>
                            <TableRow>
                              <TableCell align="left">
                                <LabelTag>MYOB Pushed Person</LabelTag>
                              </TableCell>
                              <TableCell align="left">{item.myob_pusher_Name}</TableCell>
                              <TableCell align="left">-</TableCell>
                              <TableCell align="left">{item.order_myob_moved_time_str != null ? item.order_myob_moved_time_str : null}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell align="left">
                                <LabelTag>MYOB Re-Pushed Person</LabelTag>
                              </TableCell>
                              <TableCell align="left">{item.myob_repusher_Name}</TableCell>
                              <TableCell align="left">-</TableCell>
                              <TableCell align="left">-</TableCell>
                            </TableRow>
                          </>
                        ) : (
                          ""
                        )}
                        {/* Flashing */}
                        {item.f_order_roll_user ? (
                          <>
                            <TableRow>
                              <TableCell align="left" colSpan={4}>
                                <StrongTag>
                                  Flashing - Count: {item.Order_Flashing_Count}; &nbsp; &nbsp; Rack: {item.f_order_racking_table}
                                  &nbsp; &nbsp; Dimensions: {item.f_order_racking_dimension1} x {item.f_order_racking_dimension2}
                                </StrongTag>
                              </TableCell>
                            </TableRow>

                            {item.f_order_roll_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>Flashing Rolling</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.f_order_roll_user}</TableCell>
                                <TableCell align="left">{item.f_order_roll_start_time ? moment(item.f_order_roll_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.f_order_roll_end_time ? moment(item.f_order_roll_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.f_order_fold_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>Flashing Folding</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.f_order_fold_user}</TableCell>
                                <TableCell align="left">{item.f_order_fold_start_time ? moment(item.f_order_fold_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.f_order_fold_end_time ? moment(item.f_order_fold_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.f_order_racking_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>Flashing Racking</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.f_order_racking_user}</TableCell>
                                <TableCell align="left">{item.f_order_racking_start_time ? moment(item.f_order_racking_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.f_order_racking_end_time ? moment(item.f_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                          </>
                        ) : null}

                        {/* Jobbing */}
                        {item.j_order_fold_user ? (
                          <>
                            <TableRow>
                              <TableCell align="left" colSpan={4}>
                                <StrongTag>
                                  Jobbing - Count: {item.Order_Jobbing_Count}
                                  &nbsp; &nbsp; Rack: {item.j_order_racking_table}
                                  &nbsp; &nbsp; Dimensions: {item.j_order_racking_dimension1} x {item.j_order_racking_dimension2}
                                </StrongTag>
                              </TableCell>
                            </TableRow>
                            {item.j_order_fold_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>Jobbing Folding</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.j_order_fold_user}</TableCell>
                                <TableCell align="left">{item.j_order_fold_start_time ? moment(item.j_order_fold_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.j_order_fold_end_time ? moment(item.j_order_fold_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.j_order_racking_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>Jobbing Racking</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.j_order_racking_user}</TableCell>
                                <TableCell align="left">{item.j_order_racking_start_time ? moment(item.j_order_racking_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.j_order_racking_end_time ? moment(item.j_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                          </>
                        ) : null}

                        {/* Facia Gutter */}
                        {item.fg_order_fold_user ? (
                          <>
                            <TableRow>
                              <TableCell align="left" colSpan={4}>
                                <StrongTag>
                                  Facia Gutter - Count: {item.Order_Faciagutter_Count}
                                  &nbsp; &nbsp; Rack: {item.fg_order_racking_table}
                                  &nbsp; &nbsp; Dimensions: {item.fg_order_racking_dimension1} x {item.fg_order_racking_dimension2}
                                </StrongTag>
                              </TableCell>
                            </TableRow>
                            {item.fg_order_fold_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>FG Folding</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.fg_order_fold_user}</TableCell>
                                <TableCell align="left">{item.fg_order_fold_start_time ? moment(item.fg_order_fold_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.fg_order_fold_end_time ? moment(item.fg_order_fold_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.fg_order_racking_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>FG Racking</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.fg_order_racking_user}</TableCell>
                                <TableCell align="left">{item.fg_order_racking_end_time ? moment(item.fg_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.fg_order_racking_end_time ? moment(item.fg_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                          </>
                        ) : null}

                        {/* Cladding */}
                        {item.cl_order_fold_user ? (
                          <>
                            <TableRow>
                              <TableCell align="left" colSpan={4}>
                                <StrongTag>
                                  Cladding - Count: {item.Order_Cladding_Count}
                                  &nbsp; &nbsp; Rack: {item.cl_order_racking_table}
                                  &nbsp; &nbsp; Dimensions: {item.cl_order_racking_dimension1} x {item.cl_order_racking_dimension2}
                                </StrongTag>
                              </TableCell>
                            </TableRow>
                            {item.cl_order_fold_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>CL Folding</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.cl_order_fold_user}</TableCell>
                                <TableCell align="left">{item.cl_order_fold_start_time ? moment(item.cl_order_fold_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.cl_order_fold_end_time ? moment(item.cl_order_fold_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.cl_order_racking_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>CL Racking</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.cl_order_racking_user}</TableCell>
                                <TableCell align="left">{item.cl_order_racking_start_time ? moment(item.cl_order_racking_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.cl_order_racking_end_time ? moment(item.cl_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                          </>
                        ) : null}

                        {/* GBI */}
                        {item.gbi_order_fold_user ? (
                          <>
                            <TableRow>
                              <TableCell align="left" colSpan={4}>
                                <StrongTag>
                                  GBI - Count: {item.Order_GBI_Count}
                                  &nbsp; &nbsp; Rack: {item.gbi_order_racking_table}
                                  &nbsp; &nbsp; Dimensions: {item.gbi_order_racking_dimension1} x {item.gbi_order_racking_dimension2}
                                </StrongTag>
                              </TableCell>
                            </TableRow>
                            {item.gbi_order_fold_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>GBI Folding</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.gbi_order_fold_user}</TableCell>
                                <TableCell align="left">{item.gbi_order_fold_start_time ? moment(item.gbi_order_fold_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.gbi_order_fold_end_time ? moment(item.gbi_order_fold_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.gbi_order_racking_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>GBI Racking</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.gbi_order_racking_user}</TableCell>
                                <TableCell align="left">{item.gbi_order_racking_start_time ? moment(item.gbi_order_racking_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.gbi_order_racking_end_time ? moment(item.gbi_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                          </>
                        ) : null}

                        {/* Roofing */}
                        {item.roof_order_fold_user ? (
                          <>
                            <TableRow>
                              <TableCell align="left" colSpan={4}>
                                <StrongTag>
                                  Roofing - Count: {item.Order_Roofing_Count}
                                  &nbsp; &nbsp; Rack: {item.roof_order_racking_table}
                                  &nbsp; &nbsp; Dimensions: {item.roof_order_racking_dimension1} x {item.roof_order_racking_dimension2}
                                </StrongTag>
                              </TableCell>
                            </TableRow>
                            {item.roof_order_fold_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>ROOF Folding</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.roof_order_fold_user}</TableCell>
                                <TableCell align="left">{item.roof_order_fold_start_time ? moment(item.roof_order_fold_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.roof_order_fold_end_time ? moment(item.roof_order_fold_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                            {item.roof_order_racking_user ? (
                              <TableRow>
                                <TableCell align="left">
                                  <LabelTag>ROOF Racking</LabelTag>
                                </TableCell>
                                <TableCell align="left">{item.roof_order_racking_user}</TableCell>
                                <TableCell align="left">{item.roof_order_racking_start_time ? moment(item.roof_order_racking_start_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                                <TableCell align="left">{item.roof_order_racking_end_time ? moment(item.roof_order_racking_end_time).format("DD-MM-YYYY hh:mm a") : null}</TableCell>
                              </TableRow>
                            ) : null}
                          </>
                        ) : null}
                      </>
                    ))
                  ) : (
                    <NoDataFound />
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </MyDiv>
        </DialogContent>
        <DialogActions>
          <Row className="dialogFooter">
            <Col md={12} className="d-flex justify-content-end">
              <Button onClick={handleCloseDialog} className="btn primary-btn mb-2">
                Close
              </Button>
            </Col>
          </Row>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}

export default OrderTracking;

OrderTracking.propTypes = {
  CoreOrderId: PropTypes.any,
};
