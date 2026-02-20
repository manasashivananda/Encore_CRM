import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { useParams } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import axios from "axios";
import { HeadingTwo, MyDiv, HeadingFour, SpanTag } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import FormColor from "./colorForm";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ColorManage() {
  const [data, setData] = useState("");
  const [colors, setColors] = useState("");
  const [loading, setLoading] = useState(false);
  let { id } = useParams();

  const loadColors = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-product-color-data/` + id;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setColors(response.data);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadColors();
  }, [loadColors]);

  const [colorDrawerState, setColorDrawerState] = useState(false);
  const handleColorDrawerToggle = () => {
    setData();
    setColorDrawerState(prevState => !prevState);
  };

  const colorEditId = _id => {
    setColorDrawerState(prevState => !prevState);
    setData(_id);
  };

  const updateDrawer = useCallback(() => {
    setColorDrawerState(prevState => !prevState);
    loadColors();
  }, [loadColors]);

  return (
    <React.Fragment>
      <MyDiv className="GeneralHeading d-block mt-3">
        <Row>
          <Col xs={6}>
            <HeadingTwo>Manage Colors</HeadingTwo>
          </Col>
          <Col xs={6} className="text-end">
            <Button onClick={e => handleColorDrawerToggle()} className="btn primary-btn mx-1">
              Add Colors
            </Button>
          </Col>
        </Row>
      </MyDiv>
      <MyDiv className="GeneralTable">
        <Row>
          <Col md={12}>
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey" aria-label="Color table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Color</TableCell>
                      <TableCell align="left">Code</TableCell>
                      <TableCell align="left">Hexa</TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Spl Price</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {colors?.length ? (
                      colors.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row">
                              {item.product_Color}
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              {item.product_Color_Code}
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              <SpanTag className="colorBox" style={{ backgroundColor: item.product_Color_Hex_Code ? item.product_Color_Hex_Code : "transparent" }}></SpanTag>
                            </TableCell>
                            <TableCell align="left">
                              <MyDiv>
                                {item.product_Color_Status === "active" ? (
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
                              <MyDiv>{item.product_Color_Special_Price ? item.product_Color_Special_Price : "-"} %</MyDiv>
                            </TableCell>
                            <TableCell align="center">
                              <Box className="custom-flex">
                                <Tooltip title="Edit">
                                  <IconButton aria-label="fingerprint" color="success" onClick={e => colorEditId(item._id)}>
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
                        <TableCell colSpan={5}>
                          <NoDataFound />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Col>
        </Row>
      </MyDiv>
      <Drawer anchor="right" open={colorDrawerState} onClose={handleColorDrawerToggle} disableClose={false}>
        <FormColor handleClose={updateDrawer} colorInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default ColorManage;
