import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, MyDiv, CurrencyDisplay, SpanTag } from "../../Common/Components";
import { TbTableExport } from "react-icons/tb";
import { useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Pagination, Drawer, Button, TextField, Tooltip, Box, IconButton } from "@mui/material";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import FormCustomItemCode from "./form";
import swal from "sweetalert2";
import CustomerItemBulkUpload from "./BulkUpload";
import { MdOutlineModeEditOutline, MdDelete } from "react-icons/md";
import * as XLSX from "xlsx";
import { FiLoader } from "react-icons/fi";
import sampleDocument from "../../../Assets/SampleDocs/CustomStock-Item-format.xlsx";
import { SiMicrosoftexcel } from "react-icons/si";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function CustomItemCodeManage() {
  const [searchData, setSearchData] = useState({
    search_text: "",
  });
  const [loading, setLoading] = useState(false);
  const [DeleteLoading, setDeleteLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [query, setQuery] = useState("");
  const [data, setData] = useState({});

  let navigate = useNavigate();

  const loadCustomItem = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-custom-product-data?page=${currentPage - 1}&query=${searchData.search_text}`;
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
  }, [currentPage, searchData.search_text]);
  useEffect(() => {
    loadCustomItem();
  }, [currentPage, loadCustomItem, query]);

  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
    setCurrentPage("1");
  }
  function searchSubmit(e) {
    e.preventDefault();
    setCurrentPage(1);
    setQuery(Date.now());
  }

  /* Pagination */
  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  const [customitemDrawerState, setCustomItemDrawerState] = React.useState(false);

  const handleCustomItemDrawerToggle = () => {
    setData();
    setCustomItemDrawerState(!customitemDrawerState);
  };
  const customitemEditId = _id => {
    setData(_id);
    setCustomItemDrawerState(!customitemDrawerState);
  };

  const updateDrawer = () => {
    setCustomItemDrawerState(!customitemDrawerState);
    loadCustomItem();
  };

  const updatePriceBook = () => {
    loadCustomItem();
  };
  const exportToExcel = async () => {
    try {
      const url = `${API_BASE_URL}fetch-custom-product-data?all=true`;
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
        ["Inventory ID", "Description", "ItemClass", "Base Unit", "Is Flashing", "Price"],
        ...allData.map(item => [item.custom_Product_Code, item.custom_Product_Description, item.custom_Product_Class, item.custom_Product_UOM, item.is_Flashing ? "YES" : "NO", item.custom_Product_Price]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Customer_Price_Book");
      XLSX.writeFile(wb, `Custom_Price_Book.xlsx`);
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

  const BulkDelete = async item => {
    const url = `${API_BASE_URL}delete-custom-item-code-bulk`;

    const result = await swal.fire({
      title: "Are you sure?",
      text: "This will permanently deleted from here and Customer Based Custom items.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete them!",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      customClass: {
        confirmButton: "primary-btn",
        cancelButton: "secondary-btn",
      },
    });

    if (result.isConfirmed) {
      setDeleteLoading(true);
      try {
        await axios.delete(
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
          text: "Custom Item Code(s) deleted successfully.",
          icon: "success",
        });

        loadCustomItem();
        setDeleteLoading(false);
      } catch (error) {
        swal.fire({
          text: error.response?.data || "Failed to delete item(s).",
          icon: "error",
        });
        setDeleteLoading(false);
      }
    }
  };

  const ItemDeleteId = async item => {
    const url = `${API_BASE_URL}delete-custom-item-code-single/${item}`;
    try {
      await axios.delete(
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
        text: "Custom item Deleted successfully",
        icon: "success",
      });
      loadCustomItem();
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
      });
    }
  };

  return (
    <React.Fragment>
      {DeleteLoading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
            <br />
            Deleting Custom Item Codes <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
          </SpanTag>
        </MyDiv>
      ) : (
        ""
      )}
      <Row className="GeneralHeading">
        <Col md={6}>
          <HeadingTwo>Manage Custom Item Code</HeadingTwo>
        </Col>
        {RolePermission?.CustomItemMaster?.edit === "1" ? (
          <Col md={6} xs={6} className="text-end">
            {loading ? null : (
              <>
                <Button onClick={BulkDelete} className="btn primary-btn mt-2 ms-2">
                  Bulk Delete
                </Button>
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
              </>
            )}
            <Tooltip title="Sample Document">
              <IconButton aria-label="Sample Document" color="success" component="a" href={sampleDocument} download="CustomStock-Item-format.xlsx">
                <SiMicrosoftexcel />
              </IconButton>
            </Tooltip>
            {/* <Button  onClick={(e) => handleCustomItemDrawerToggle()} className="btn primary-btn">Add Custom Item</Button>  */}
          </Col>
        ) : (
          ""
        )}
      </Row>
      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={12}>
          <form onSubmit={searchSubmit}>
            <Row>
              <Col md={4} className="SearchTextBox">
                <TextField onChange={searchHandle} className="textarea" id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
              <Col md={6} className="text-end">
                {RolePermission?.CustomItemMaster?.edit === "1" ? <CustomerItemBulkUpload handleResponse={updatePriceBook} /> : ""}
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
      <Row>
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
                    <TableCell align="left">Is Flashing</TableCell>
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
                          {item.is_Flashing ? "YES" : "NO"}
                        </TableCell>
                        <TableCell align="left" component="th" scope="row">
                          <CurrencyDisplay value={item.custom_Product_Price} currency="AUD" locale="en-US" />
                        </TableCell>
                        <TableCell align="center">
                          {RolePermission?.CustomItemMaster?.edit === "1" ? (
                            <Box className="custom-flex">
                              <Tooltip title="Edit">
                                <IconButton aria-label="fingerprint" color="success" onClick={e => customitemEditId(item._id)}>
                                  <MdOutlineModeEditOutline />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton aria-label="fingerprint" color="error" onClick={e => ItemDeleteId(item.custom_Product_Code)}>
                                  <MdDelete />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            ""
                          )}
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
      </Row>
      <Drawer anchor="right" open={customitemDrawerState} onClose={handleCustomItemDrawerToggle} disableClose="false">
        <FormCustomItemCode handleClose={updateDrawer} customItemInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomItemCodeManage;
