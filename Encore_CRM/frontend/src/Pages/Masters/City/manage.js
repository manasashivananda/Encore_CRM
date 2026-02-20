import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv } from "../../Common/Components";
import Badge from "react-bootstrap/Badge";
import { MdKeyboardArrowLeft, MdDelete, MdOutlineModeEditOutline } from "react-icons/md";
import { TbTableExport } from "react-icons/tb";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button, TextField, Pagination } from "@mui/material";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import FormCity from "./form";
import swal from "sweetalert2";
import sampleDocument from "../../../Assets/SampleDocs/city-sample.xlsx";
import * as XLSX from "xlsx";
import { SiMicrosoftexcel } from "react-icons/si";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CityManage() {
  let location = useLocation();
  let navigate = useNavigate();
  const [data, setData] = useState("");
  const [fileData, setFileData] = useState(null);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);

  const loadCity = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-city-data?page=${currentPage - 1}&query=${searchData.search_text}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setCity(response.data.fetchedItems);
      setPageCount(response.data.totalPages);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [searchData.search_text, currentPage]);

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  useEffect(() => {
    loadCity();
  }, [loadCity]);

  /* Search Module */
  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
    setCurrentPage(1);
  }

  const [cityDrawerState, setCityDrawerState] = React.useState(false);
  const handleCityDrawerToggle = () => {
    setData();
    cityDrawerState === false ? setCityDrawerState(true) : setCityDrawerState(false);
  };
  const cityEditId = _id => {
    cityDrawerState === false ? setCityDrawerState(true) : setCityDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    cityDrawerState === false ? setCityDrawerState(true) : setCityDrawerState(false);
    loadCity();
  };

  const handleFileUpload = e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = event => {
      const fileData = event.target.result;
      setFileData(fileData);
    };
    if (file) {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!fileData) {
      swal.fire({
        text: "Please select a file",
        icon: "error",
        type: "error",
      });
      return;
    }
    setLoading(true);

    const url = `${API_BASE_URL}bulk-import-city`;
    const method = "post";
    const formData = new FormData();
    formData.append("documents", new Blob([fileData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "filename.xlsx");

    try {
      const response = await axios({
        method,
        url,
        data: formData,
        headers: { "x-access-token": localStorage.getItem("token"), "Content-Type": "multipart/form-data" },
      });

      if (response.status === 200) {
        setLoading(false);
        swal.fire({
          text: "Successfully Added City",
          icon: "success",
          type: "success",
        });
        setFileData(null);
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
          fileInput.value = "";
        }
        loadCity();
      }
    } catch (error) {
      setLoading(false);
      swal.fire({
        text: error.response.message,
        icon: "error",
        type: "error",
      });
    }
  };

  const exportToExcel = async () => {
    try {
      const url = `${API_BASE_URL}bulk-export-city`;
      const response = await axios.get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      });

      const allData = response.data;
      if (!allData.length) {
        swal.fire({
          text: "No data available to export.",
          icon: "warning",
          type: "warning",
        });
        return;
      }

      const wb = XLSX.utils.book_new();
      const wsData = [
        ["City Name", "Postal Code", "Rack Number", "Far Suburb", "State", "Country"],
        ...allData.map(item => [item.city_Name, item.city_Pincode, item.city_Rack, item.city_FarSuburb, item.city_State, item.city_Country]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Customer_Price_Book");
      XLSX.writeFile(wb, `City Master Export.xlsx`);
      swal.fire({
        text: "Excel file exported successfully!",
        icon: "success",
        timer: 1000,
        showConfirmButton: false,
      });
    } catch (error) {
      swal.fire({
        text: error.response || "Failed to export data.",
        icon: "error",
        type: "error",
      });
    }
  };

  const ItemDeleteId = async item => {
    const url = `${API_BASE_URL}delete-specific-city-data/${item}`;
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
      swal.fire({
        text: response.data || "City Deleted successfully",
        icon: "success",
      });
      loadCity();
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
      });
    }
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage City
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={e => handleCityDrawerToggle()} className="btn primary-btn mx-1">
            Add City
          </Button>
        </Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={12}>
          <Row className="justify-content-between">
            <Col md={6} className="SearchTextBox">
              <TextField
                onChange={e => searchHandle(e)}
                className="textarea"
                required
                id="search_text"
                placeholder="City Name, Postal code and Rack"
                value={searchData.search_text}
                variant="standard"
              />
            </Col>
            <Col md={6} className="d-flex align-items-end">
              <MyDiv className="w-100 d-flex justify-content-end">
                <MyDiv className="w-50 d-flex">
                  <input type="file" className="float-start w-50 mt-1" accept=".xls,.xlsx" onChange={handleFileUpload} />
                  <button className="btn primary-btn add-cta search mx-1" onClick={handleSubmit}>
                    Upload File
                  </button>
                </MyDiv>
                {loading ? null : (
                  <Tooltip title="Export Excel" className="mx-2">
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
                <Tooltip title="Sample Document">
                  <IconButton aria-label="Sample Document" color="success" component="a" href={sampleDocument} download="city-sample.xlsx">
                    <SiMicrosoftexcel />
                  </IconButton>
                </Tooltip>
              </MyDiv>
            </Col>
          </Row>
        </Col>
      </Row>
      <Row>
        <Col>
          <MyDiv className="GeneralTable">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <>
                <TableContainer>
                  <Table className="bgGrey" aria-label="City table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left">City Name</TableCell>
                        <TableCell align="left">Postal Code</TableCell>
                        <TableCell align="left">Rack Number</TableCell>
                        <TableCell align="left">Far Suburb</TableCell>
                        <TableCell align="left">State</TableCell>
                        <TableCell align="left">Country</TableCell>
                        <TableCell align="left">Status</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {city?.length ? (
                        city.map(item => (
                          <React.Fragment key={item._id}>
                            <TableRow>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_Name}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_Pincode}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_Rack}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_FarSuburb ? (
                                  <Badge bg="success" text="light" className="text-uppercase">
                                    True
                                  </Badge>
                                ) : (
                                  <Badge bg="danger" text="light" className="text-uppercase">
                                    False
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_State}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_Country}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.city_Status === "active" ? (
                                  <Badge bg="success" text="light" className="text-uppercase">
                                    {item.city_Status}
                                  </Badge>
                                ) : (
                                  <Badge bg="danger" text="light" className="text-uppercase">
                                    {item.city_Status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell align="center">
                                <Box className="custom-flex">
                                  <Tooltip title="Edit">
                                    <IconButton aria-label="fingerprint" color="success" onClick={e => cityEditId(item._id)}>
                                      <MdOutlineModeEditOutline />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete">
                                    <IconButton aria-label="fingerprint" color="error" onClick={e => ItemDeleteId(item._id)}>
                                      <MdDelete />
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
                <MyDiv className="reactPaginate d-flex justify-content-center mt-4">
                  <Pagination count={pageCount} page={currentPage} onChange={handlePageChange} />
                </MyDiv>
              </>
            )}
          </MyDiv>
        </Col>
      </Row>
      <Drawer anchor="right" open={cityDrawerState} onClose={handleCityDrawerToggle} disableClose="false">
        <FormCity handleClose={updateDrawer} cityInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default CityManage;
