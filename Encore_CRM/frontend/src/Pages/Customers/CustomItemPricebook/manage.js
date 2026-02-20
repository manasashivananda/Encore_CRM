import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, MyDiv, CurrencyDisplay, HeadingFour } from "../../Common/Components";
import { useParams, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button, TextField, Pagination } from "@mui/material";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import FormCustomItemCode from "./form";
import swal from "sweetalert2";
import { MdOutlineModeEditOutline } from "react-icons/md";
import CustomerItemBulkUpload from "../../Masters/CustomItemCode/BulkUpload";
import * as XLSX from "xlsx";
import sampleDocument from "../../../Assets/SampleDocs/CustomStock-Item-format.xlsx";
import { SiMicrosoftexcel } from "react-icons/si";
import { TbTableExport } from "react-icons/tb";
import { AiOutlineMergeCells } from "react-icons/ai";
import { MdOutlineAssignmentReturned } from "react-icons/md";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerCustomItemPriceBookManage({ handleCustomItemResponse }) {
  let { id } = useParams();

  const [searchData, setSearchData] = useState({
    search_text: "",
  });
  const [loading, setLoading] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState({});

  let navigate = useNavigate();

  const loadCustomItem = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-custom-product-data-customer-priced/${id}?page=${currentPage - 1}&query=${searchData.search_text}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setPosts(response.data.fetchedItems);
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
  }, [currentPage, id, searchData.search_text]);

  useEffect(() => {
    loadCustomItem();
  }, [currentPage, loadCustomItem]);

  /* Search Module start*/
  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
  }
  function searchSubmit(e) {
    e.preventDefault();
    loadCustomItem();
  }
  /* Search Module End*/

  /* Pagination */
  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  const [customItemDrawerState, setCustomItemDrawerState] = React.useState(false);
  const handleCustomItemDrawerToggle = () => {
    setData();
    setCustomItemDrawerState(!customItemDrawerState);
  };
  const customitemEditId = _id => {
    setData(_id);
    setCustomItemDrawerState(!customItemDrawerState);
  };

  const updateDrawer = () => {
    setCustomItemDrawerState(!customItemDrawerState);
    loadCustomItem();
  };

  const updatePriceBook = () => {
    loadCustomItem();
    handleCustomItemResponse();
  };

  const exportToExcel = async () => {
    try {
      const url = `${API_BASE_URL}fetch-custom-product-data-customer-priced/${id}?all=true`;
      const response = await axios.get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      });

      const allData = response.data.fetchedItems;
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
        ["Inventory ID", "Description", "ItemClass", "Base Unit", "Price"], // Headers
        ...allData.map(item => [item.custom_Product_Code, item.custom_Product_Description, item.custom_Product_Class, item.custom_Product_UOM, item.custom_Product_Price]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Customer_Price_Book");
      XLSX.writeFile(wb, `Customer_Price_Book_${id}.xlsx`);
      swal.fire({
        text: "Excel file exported successfully!",
        icon: "success",
        timer: 1000,
        showConfirmButton: false,
      });
    } catch (error) {
      swal.fire({
        text: error.response.data || "Failed to export data.",
        icon: "error",
        type: "error",
      });
    }
  };

  const AssignDefaultPriceForCustomer = async e => {
    e.preventDefault();

    const result = await swal.fire({
      title: "Are you sure?",
      text: "Assign default prices to this customer? Existing custom prices will be overwritten.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Assign",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      customClass: {
        confirmButton: "primary-btn",
        cancelButton: "secondary-btn",
      },
    });
    if (!result.isConfirmed) return;
    setBtnLoading(true);
    try {
      const url = `${API_BASE_URL}assign-default-customitem-price-to-customer/${id}`;
      await axios.post(
        url,
        {},
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      swal.fire({
        text: "Successfully assigned default prices to this customer.",
        icon: "success",
      });
      loadCustomItem();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Failed to assign default prices.",
        icon: "error",
      });
    } finally {
      setBtnLoading(false);
    }
  };

  function handleReset() {
    setSearchData({ search_text: "" });
    loadCustomItem();
  }
  const MergePriceBook = async () => {
    const result = await swal.fire({
      title: "Are you sure?",
      text: "This will merge master item codes into this customer price book. Existing matching records not affected.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Merge",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      customClass: {
        confirmButton: "primary-btn",
        cancelButton: "secondary-btn",
      },
    });

    if (!result.isConfirmed) return;

    setBtnLoading(true);

    try {
      const url = `${API_BASE_URL}fetch-master-custom-item-codes-update-customer-code-list/${id}`;
      await axios.post(
        url,
        {},
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      swal.fire({
        text: "Successfully merged item codes for this customer.",
        icon: "success",
      });

      loadCustomItem();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Merge failed due to a server error.",
        icon: "error",
      });
    } finally {
      setBtnLoading(false);
    }
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading mt-3">
        <Col md={7}>
          <HeadingTwo>Customer Based Custom Item Price Book</HeadingTwo>
        </Col>

        <Col md={3} className="text-end">
          <CustomerItemBulkUpload cusId={id} handleResponse={updatePriceBook} />
        </Col>
        <Col md={2} className="d-flex justify-content-end">
          {btnLoading ? (
            <Button className="btn secondary-btn">Please Wait...</Button>
          ) : (
            <>
              <Tooltip title="Assign Default Price" className="me-2">
                <IconButton
                  aria-label="Export To Excel"
                  color="success"
                  sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#bf3030", "&:hover": { backgroundColor: "#bf3030" } }}
                  component="a"
                  onClick={AssignDefaultPriceForCustomer}
                >
                  <MdOutlineAssignmentReturned />
                </IconButton>
              </Tooltip>
              <Tooltip title="Merge From Master" className="me-2">
                <IconButton
                  aria-label="Fetch PriceBook"
                  color="primary"
                  sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#0d6efd", "&:hover": { backgroundColor: "#0d6efd" } }}
                  component="a"
                  onClick={MergePriceBook}
                  download="CustomStock-Item-format.xlsx"
                >
                  <AiOutlineMergeCells />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export Excel" className="me-2">
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
              <Tooltip title="Sample Document">
                <IconButton
                  aria-label="Sample Document"
                  color="success"
                  sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#198754", "&:hover": { backgroundColor: "#198754" } }}
                  component="a"
                  href={sampleDocument}
                  download="CustomStock-Item-format.xlsx"
                >
                  <SiMicrosoftexcel />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={12}>
          <form onSubmit={searchSubmit}>
            <Row>
              <Col md={4} className="SearchTextBox">
                <TextField onChange={searchHandle} className="textarea" required id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
              <Col md="auto">
                <Button variant="outlined" color="secondary" type="button" onClick={handleReset}>
                  Reset
                </Button>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
      <Row>
        {loading ? (
          <HeadingFour className="text-center">Loading...</HeadingFour>
        ) : (
          <Col>
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Employee table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Item Code</TableCell>
                      <TableCell align="left">Item Description</TableCell>
                      <TableCell align="left">Item Class</TableCell>
                      <TableCell align="left">UOM</TableCell>
                      <TableCell align="left">Item Price</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {posts?.length ? (
                      posts.map(item => (
                        <TableRow key={item._id}>
                          <TableCell align="left" component="th" scope="row">
                            {item.custom_Product_Code}
                          </TableCell>
                          <TableCell align="left" component="th" scope="row">
                            {item.custom_Product_Description}
                          </TableCell>
                          <TableCell align="left" component="th" scope="row">
                            {item.custom_Product_Class}
                          </TableCell>
                          <TableCell align="left" component="th" scope="row">
                            {item.custom_Product_UOM}
                          </TableCell>
                          <TableCell align="left" component="th" scope="row">
                            <CurrencyDisplay value={item.custom_Product_Price} currency="AUD" locale="en-US" />
                          </TableCell>
                          <TableCell align="center">
                            <Box className="custom-flex">
                              <Tooltip title="Edit">
                                <IconButton aria-label="fingerprint" color="success" onClick={e => customitemEditId(item._id)}>
                                  <MdOutlineModeEditOutline />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
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
              <MyDiv className="reactPaginate d-flex justify-content-center mt-4">
                <Pagination count={pageCount} page={currentPage} onChange={handlePageChange} />
              </MyDiv>
            </MyDiv>
          </Col>
        )}
      </Row>
      <Drawer anchor="right" open={customItemDrawerState} onClose={handleCustomItemDrawerToggle} disableClose="false">
        <FormCustomItemCode handleClose={updateDrawer} customItemInfo={data} customerId={id} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerCustomItemPriceBookManage;
