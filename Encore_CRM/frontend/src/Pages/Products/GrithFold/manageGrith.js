import React, { useState, useEffect } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import axios from "axios";
import { HeadingTwo, MyDiv, HeadingFour } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import FormGirth from "./formGrith";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function GirthManage() {
  const [data, setData] = useState("");
  const [girths, setGirths] = useState("");
  const [loading, setLoading] = useState(false);

  let navigate = useNavigate();
  useEffect(() => {
    loadGirths();
  }, []);

  const loadGirths = async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-product-girth-data`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setGirths(res.data);
      },
      error => {
        console.log(error);
      }
    );
    setLoading(false);
  };

  const [girthDrawerState, setGirthDrawerState] = React.useState(false);
  const handleGirthDrawerToggle = () => {
    setData();
    girthDrawerState === false ? setGirthDrawerState(true) : setGirthDrawerState(false);
  };
  const girthEditId = _id => {
    girthDrawerState === false ? setGirthDrawerState(true) : setGirthDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    girthDrawerState === false ? setGirthDrawerState(true) : setGirthDrawerState(false);
    loadGirths();
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage Girths
          </HeadingTwo>
        </Col>
        <Col md={6} className="text-end">
          <Button onClick={e => handleGirthDrawerToggle()} className="btn primary-btn mx-1">
            Add Girth
          </Button>
        </Col>
      </Row>
      <MyDiv className="GeneralTable">
        <Row>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <>
              <TableContainer>
                <Table className="bgGrey" aria-label="Girth table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Girth</TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {girths?.length ? (
                      girths.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row">
                              {item.product_Girth}
                            </TableCell>
                            <TableCell align="left">
                              <MyDiv>
                                {item.product_Girth_Status === "active" ? (
                                  <Badge bg="success" text="light">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge bg="danger" text="light">
                                    InActive
                                  </Badge>
                                )}
                              </MyDiv>
                            </TableCell>
                            <TableCell align="center">
                              <Box className="custom-flex">
                                <Tooltip title="Edit">
                                  <IconButton aria-label="fingerprint" color="success" onClick={e => girthEditId(item._id)}>
                                    <MdOutlineModeEditOutline />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <NoDataFound />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Row>
      </MyDiv>
      <Drawer anchor="right" open={girthDrawerState} onClose={handleGirthDrawerToggle} disableClose="false">
        <FormGirth handleClose={updateDrawer} girthInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default GirthManage;
