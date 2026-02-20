import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Spinner, Button } from "react-bootstrap";
import { useParams } from "react-router-dom";
import {
  TableBody,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  Drawer,
  TextField,
  Tooltip,
  IconButton,
} from "@mui/material";
import axios from "axios";
import { HeadingTwo, HeadingFour, MyDiv, CurrencyDisplay, StrongTag } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import FormMaterialPrice from "./priceForm";
import { MdOutlineModeEditOutline } from "react-icons/md";
import sampleDocument from "../../../Assets/SampleDocs/Sample-material-pricebook.xlsx";
import { SiMicrosoftexcel } from "react-icons/si";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function ManageMaterialPrice() {
  let { id } = useParams();
  const [data, setData] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [percentage, setPercentage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadBtnLoading, setUploadBtnLoading] = useState(false);
  const [percentageBtnLoading, setPercentageBtnLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-material-priceBook/` + id;
    const res = await axios.get(url, {
      headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
    });
    setLoading(false);
    setProducts(res.data);
  }, [id]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handlePercentageChange = e => {
    setPercentage(e.target.value);
  };
  const handleFileChange = event => {
    setSelectedFile(event.target.files[0]);
  };

  const [priceBookDrawerState, setPriceBookDrawerState] = React.useState(false);
  const handlePriceBookDrawerToggle = () => {
    setData();
    priceBookDrawerState === false ? setPriceBookDrawerState(true) : setPriceBookDrawerState(false);
  };
  const priceBookEditId = _id => {
    priceBookDrawerState === false ? setPriceBookDrawerState(true) : setPriceBookDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    priceBookDrawerState === false ? setPriceBookDrawerState(true) : setPriceBookDrawerState(false);
    loadProducts();
  };

  const applyPercentage = async materialId => {
    setPercentageBtnLoading(true);
    if (!percentage) {
      setPercentageBtnLoading(false);
      alert("Please enter a discount percentage");
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE_URL}update-specific-material-percentage/${materialId}`,
        { percentage },
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            "Content-Type": "application/json",
          },
        }
      );
      swal.fire({
        text: res.data || "Successfully Saved",
        icon: "success",
        type: "success",
        timer: 1000,
      });
      loadProducts();
      setPercentage();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Something went wrong",
        icon: "error",
        type: "error",
      });
    } finally {
      setPercentageBtnLoading(false);
    }
  };

  const uploadFile = async materialId => {
    setUploadBtnLoading(true);
    if (!selectedFile) {
      setUploadBtnLoading(false);
      alert("Please select a file to upload");
      return;
    }
    const formData = new FormData();
    formData.append("documents", selectedFile);
    try {
      const res = await axios.post(`${API_BASE_URL}update-specific-material-price-book/${materialId}`, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          "Content-Type": "multipart/form-data",
        },
      });
      swal.fire({
        text: res.data || "Successfully Saved",
        icon: "success",
        type: "success",
        timer: 1000,
      });
      loadProducts();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Something went wrong",
        icon: "error",
        type: "error",
      });
    } finally {
      setSelectedFile();
      setUploadBtnLoading(false);
    }
  };

  return (
    <React.Fragment>
      <MyDiv className="GeneralHeading mt-3">
        <Row>
          <Col md={12}>
            <HeadingTwo>Price Book</HeadingTwo>
          </Col>
        </Row>
      </MyDiv>
      {loading ? (
        <HeadingFour className="text-center LoaderText mt-4">
          Generating price matrix based on Customer. Please wait...
        </HeadingFour>
      ) : (
        <>
          {products?.length ? (
            products.map((item, index) => (
              <Row key={index}>
                <Col md={12}>
                  <Row className="GeneralHeading mt-3 bdrbtm">
                    <Col xs={4}>
                      <HeadingTwo> {item.name} </HeadingTwo>
                    </Col>
                    <Col xs={8} className="d-flex justify-content-end">
                      {RolePermission?.PriceBook?.view === "1" ? (
                        <Row>
                          <Col md={5}>
                            <MyDiv className="d-flex w-100">
                              <TextField
                                id="percentage"
                                label="Percentage %"
                                variant="standard"
                                onChange={handlePercentageChange}
                              />
                              {percentageBtnLoading ? (
                                <Button variant="primary" disabled>
                                  <span aria-live="polite" className="d-inline-flex align-items-center">
                                    <Spinner
                                      as="span"
                                      animation="border"
                                      size="sm"
                                      aria-hidden="true"
                                      className="mx-2"
                                    />
                                    <span className="visually-hidden">Please wait...</span>
                                  </span>
                                </Button>
                              ) : (
                                <Button
                                  className="btn primary-btn mt-2 ms-2 mt-1"
                                  onClick={() => applyPercentage(item.id)}>
                                  Apply
                                </Button>
                              )}
                            </MyDiv>
                          </Col>
                          <Col md={6}>
                            <StrongTag className="float-start w-100">
                              Specific Material Default Price Bulk Upload
                            </StrongTag>
                            <MyDiv className="d-flex w-100">
                              <input
                                type="file"
                                className="float-start mt-1"
                                accept=".xls,.xlsx"
                                onChange={handleFileChange}
                              />
                              {uploadBtnLoading ? (
                                <Button variant="primary" disabled>
                                  <span aria-live="polite" className="d-inline-flex align-items-center">
                                    <Spinner
                                      as="span"
                                      animation="border"
                                      size="sm"
                                      aria-hidden="true"
                                      className="mx-2"
                                    />
                                    <span className="visually-hidden">Please wait...</span>
                                  </span>
                                </Button>
                              ) : (
                                <Button className="btn primary-btn" onClick={() => uploadFile(item.id)}>
                                  Upload File
                                </Button>
                              )}
                            </MyDiv>
                          </Col>
                          <Col md={1} className="d-flex justify-content-end">
                            <Tooltip title="Sample Document">
                              <IconButton
                                aria-label="Sample Document"
                                color="success"
                                component="a"
                                href={sampleDocument}
                                download="Sample-material-pricebook.xlsx">
                                <SiMicrosoftexcel />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <IconButton aria-label="fingerprint" color="success" onClick={e => priceBookEditId(item)}>
                                <MdOutlineModeEditOutline />
                              </IconButton>
                            </Tooltip>
                          </Col>
                        </Row>
                      ) : (
                        ""
                      )}
                    </Col>
                  </Row>
                </Col>
                <Col md={12} className="mt-0">
                  <MyDiv className="GeneralTable">
                    <TableContainer>
                      <Table className="bgGrey" aria-label="Material table">
                        <TableHead>
                          <TableRow>
                            {item.pricedetails.headers.map((Headeritem, index) => (
                              <React.Fragment key={index}>
                                <TableCell>{Headeritem.value}</TableCell>
                              </React.Fragment>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {item.pricedetails.rowvalues.map((Rowitem, index) => (
                            <React.Fragment key={index}>
                              <TableRow>
                                {Rowitem?.length
                                  ? Rowitem.map((itemInner, index) => (
                                      <React.Fragment key={index}>
                                        <TableCell>
                                          {" "}
                                          {index !== 0 ? (
                                            <CurrencyDisplay value={itemInner.value} currency="AUD" locale="en-US" />
                                          ) : (
                                            itemInner.value
                                          )}
                                        </TableCell>
                                      </React.Fragment>
                                    ))
                                  : null}
                              </TableRow>
                            </React.Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MyDiv>
                </Col>
              </Row>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}

      <Drawer anchor="right" open={priceBookDrawerState} onClose={handlePriceBookDrawerToggle}>
        <FormMaterialPrice handleClose={updateDrawer} materialInfo={data} materialPriceBookId={id} />
      </Drawer>
    </React.Fragment>
  );
}

export default ManageMaterialPrice;
