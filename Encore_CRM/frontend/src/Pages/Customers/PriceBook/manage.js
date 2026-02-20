import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Spinner, Button } from "react-bootstrap";
import { useParams } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Drawer, TextField, Tooltip, IconButton } from "@mui/material";
import axios from "axios";
import FormPriceBook from "./form";
import { HeadingTwo, HeadingFour, MyDiv, CurrencyDisplay, StrongTag } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import CustomerPriceBulkUpload from "./CustomerPriceBulkUpload";
import * as XLSX from "xlsx";
import swal from "sweetalert2";
import sampleDocument from "../../../Assets/SampleDocs/Sample-material-pricebook.xlsx";
import { SiMicrosoftexcel } from "react-icons/si";
import { MdOutlineModeEditOutline } from "react-icons/md";
import { TbTableExport } from "react-icons/tb";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function CustomerPriceBookManage() {
  let { id } = useParams();
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [priceBookDrawerState, setPriceBookDrawerState] = useState(false);
  const [percentage, setPercentage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const [loadingStates, setLoadingStates] = useState({});

  const loadCustomerPriceBook = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-customer-specific-material-pricebook/${id}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setProducts(res.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCustomerPriceBook();
  }, [loadCustomerPriceBook]);

  const handlePriceBookDrawerToggle = () => {
    setData(null);
    setPriceBookDrawerState(!priceBookDrawerState);
  };

  const priceBookEditId = _id => {
    handlePriceBookDrawerToggle();
    setData(_id);
  };

  const updateDrawer = () => {
    handlePriceBookDrawerToggle();
    loadCustomerPriceBook();
  };

  const updatePriceBook = () => {
    loadCustomerPriceBook();
  };

  const exportToExcel = () => {
    try {
      if (!products.length) {
        swal.fire({
          text: "No data available to export.",
          icon: "warning",
          timer: 1500,
          showConfirmButton: false,
        });
        return;
      }

      const exportRows = [];

      products.forEach(product => {
        const category = product.code;
        const folds = product.pricedetails.headers.slice(1).map(h => h.value);
        const rows = product.pricedetails.rowvalues;

        rows.forEach(row => {
          const girth = row[0].value;
          for (let i = 1; i < row.length; i++) {
            const fold = folds[i - 1];
            const priceValue = row[i].value;

            if (priceValue !== "-") {
              exportRows.push({
                Girth: girth,
                Folds: fold,
                Cat2: category,
                Price: parseFloat(priceValue),
              });
            }
          }
        });
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customer Price Book");

      XLSX.writeFile(wb, `Customer_Price_Book_${id}.xlsx`);

      swal.fire({
        text: "Excel file exported successfully!",
        icon: "success",
        timer: 1000,
        showConfirmButton: false,
      });
    } catch (error) {
      swal.fire({
        text: error.responce || "Failed to export data.",
        icon: "error",
        timer: 1000,
        showConfirmButton: false,
      });
    }
  };

  const handlePercentageChange = e => {
    setPercentage(e.target.value);
  };
  const handleFileChange = event => {
    setSelectedFile(event.target.files[0]);
  };

  const applyPercentage = async materialId => {
    setLoadingStates(prev => ({ ...prev, [`discount_${materialId}`]: true }));
    if (!percentage) {
      alert("Please enter a percentage");
      setLoadingStates(prev => ({ ...prev, [`discount_${materialId}`]: false }));
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}update-specific-material-percentage-for-customer/${materialId}`,
        { customerId: id, percentage },
        { headers: { "x-access-token": localStorage.getItem("token"), "Content-Type": "application/json" } }
      );
      swal.fire({ text: "Successfully Saved", icon: "success", timer: 1000 });
      loadCustomerPriceBook();
    } catch (error) {
      swal.fire({ text: error.response.data.error, icon: "error" });
    } finally {
      setLoadingStates(prev => ({ ...prev, [`discount_${materialId}`]: false }));
    }
  };

  const uploadFile = async materialId => {
    setLoadingStates(prev => ({ ...prev, [`upload_${materialId}`]: true }));
    if (!selectedFile) {
      alert("Please select a file to upload");
      setLoadingStates(prev => ({ ...prev, [`upload_${materialId}`]: false }));
      return;
    }
    const formData = new FormData();
    formData.append("documents", selectedFile);
    try {
      const res = await axios.post(`${API_BASE_URL}update-specific-material-price-book-for-customer/${materialId}/${id}`, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          "Content-Type": "multipart/form-data",
        },
      });
      swal.fire({
        text: res.data || "Successfully Saved",
        icon: "success",
        timer: 1000,
      });
      loadCustomerPriceBook();
      setSelectedFile(null);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Upload failed",
        icon: "error",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [`upload_${materialId}`]: false }));
    }
  };

  return (
    <React.Fragment>
      <MyDiv className="GeneralHeading mt-3">
        <Row className="w-100">
          <Col md={8} className="d-flex align-items-center ">
            <HeadingTwo>Customer Based Flashing Price Book</HeadingTwo>
          </Col>

          <Col md={4} className="d-flex align-items-center justify-content-center">
            <CustomerPriceBulkUpload cusId={id} handleResponse={updatePriceBook} />
            {loading ? null : (
              <Tooltip title="Export Excel" className="mx-2 mt-1">
                <IconButton
                  aria-label="Export To Excel"
                  color="success"
                  sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#30bf5c", "&:hover": { backgroundColor: "#30bf5c" } }}
                  component="a"
                  onClick={exportToExcel}
                >
                  <TbTableExport />
                </IconButton>
              </Tooltip>
            )}
          </Col>
        </Row>
      </MyDiv>
      {loading ? (
        <HeadingFour className="text-center LoaderText mt-4">Generating price matrix based on Customer. Please wait...</HeadingFour>
      ) : (
        <>
          {products.length ? (
            products.map(item => (
              <React.Fragment key={item.id}>
                <Row className="w-100 GeneralHeading mt-3  bdrbtm">
                  <Col xs={4}>
                    <HeadingTwo>{item.name}</HeadingTwo>
                  </Col>
                  <Col xs={8} className="text-center">
                    {RolePermission?.PriceBook?.view === "1" ? (
                      <Row>
                        <Col md={5}>
                          <MyDiv className="d-flex w-100">
                            <TextField id="percentage" label="Percentage %" variant="standard" onChange={handlePercentageChange} />
                            {loadingStates[`discount_${item.id}`] ? (
                              <Button className="btn primary-btn mt-2 ms-2 mt-1" disabled>
                                <span aria-live="polite" className="d-inline-flex align-items-center">
                                  <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                                </span>
                              </Button>
                            ) : (
                              <Button className="btn primary-btn mt-2 ms-2 mt-1" onClick={() => applyPercentage(item.id)}>
                                Apply
                              </Button>
                            )}
                          </MyDiv>
                        </Col>
                        <Col md={6}>
                          <StrongTag className="float-start w-100">Specific Material Customer Based Price Bulk Upload</StrongTag>
                          <MyDiv className="d-flex w-100">
                            <input type="file" className="float-start mt-1" accept=".xls,.xlsx" onChange={handleFileChange} />
                            {loadingStates[`upload_${item.id}`] ? (
                              <Button className="btn primary-btn mt-2 ms-2 mt-1" disabled>
                                <span aria-live="polite" className="d-inline-flex align-items-center">
                                  <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
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
                            <IconButton aria-label="Sample Document" color="success" component="a" href={sampleDocument} download="Sample-material-pricebook.xlsx">
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

                <Col md={12} className="mt-0">
                  <MyDiv className="GeneralTable">
                    <TableContainer>
                      <Table className="bgGrey" aria-label="Material table">
                        <TableHead>
                          <TableRow>
                            {item.pricedetails.headers.map(Headeritem => (
                              <TableCell key={Headeritem.id || Headeritem.value}>{Headeritem.value}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {item.pricedetails.rowvalues.map((Rowitem, rowIndex) => {
                            const rowKey = Rowitem[0]?.value || `row-${rowIndex}`;
                            return (
                              <TableRow key={rowKey}>
                                {Rowitem.map((itemInner, cellIndex) => {
                                  const cellKey = `${rowKey}-${cellIndex}`;
                                  return (
                                    <TableCell key={cellKey}>
                                      {cellIndex !== 0 ? itemInner.value !== "-" ? <CurrencyDisplay value={itemInner.value} currency="AUD" locale="en-US" /> : "-" : itemInner.value}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MyDiv>
                </Col>
              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}

      <Drawer anchor="right" open={priceBookDrawerState} onClose={handlePriceBookDrawerToggle}>
        <FormPriceBook handleClose={updateDrawer} customerInfo={data} customerPriceBookId={id} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerPriceBookManage;
