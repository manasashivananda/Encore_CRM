import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv, SpanTag, Avatar } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Drawer, Button, TextField } from "@mui/material";

import axios from "axios";
import FormCustomer from "./form";
import swal from "sweetalert2";
import { CgImport } from "react-icons/cg";
import CommonDataGrid from "../Common/commonDataGrid";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function CustomerManage() {
  let location = useLocation();
  const [data, setData] = useState("");
  const [customers, setCustomers] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [paginationModel, setPaginationModel] = useState({
      page: parseInt(new URLSearchParams(location.search).get("page")) - 1 || 0,
      pageSize: 20,
    });
  const [searchData, setSearchData] = useState({
    search_text: "",
  });
  const [sortModel, setSortModel] = useState([]);

  let navigate = useNavigate();

  const sortField = sortModel[0]?.field || "order_unique_id";
  const sortOrder = sortModel[0]?.sort === "asc" ? "1" : "-1";

  const handleSortModelChange = useCallback(model => {
    setSortModel(model);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, []);

  const loadCustomers = useCallback(async () => {
    const url = `${API_BASE_URL}fetch-account-data?page=${paginationModel.page}&pageSize=${paginationModel.pageSize}&query=${searchData.search_text}&sortField=${sortField}&sortDirection=${sortOrder}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setCustomers(response.data);
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
  }, [paginationModel, searchData.search_text, sortModel]);


  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const customerBulkImport = async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-customer-list-with-details-from-myob`;

    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      setCustomers(res.data);
      loadCustomers();

      swal.fire({
        text: res.data || "Customers imported successfully",
        icon: "success",
        type: "success",
        timer: 1000,
      });
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Customer Fetching Failed, Please Check Network / Duplication",
        icon: "error",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  /* Search Module start*/
  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
  }
  function searchSubmit(e) {
    setPaginationModel((prev) => ({...prev, page:0}));
    e.preventDefault();
    loadCustomers();
  }
  /* Search Module End*/

  const [customerDrawerState, setCustomerDrawerState] = React.useState(false);
  const handleCustomerDrawerToggle = () => {
    setData();
    customerDrawerState === false ? setCustomerDrawerState(true) : setCustomerDrawerState(false);
  };
  /* const customerEditId = _id => {
     customerDrawerState === false ? setCustomerDrawerState(true) : setCustomerDrawerState(false);
     setData(_id);
   }; */
  const updateDrawer = () => {
    customerDrawerState === false ? setCustomerDrawerState(true) : setCustomerDrawerState(false);
    loadCustomers();
  };

  const columns = [
    {
      field: "account_Name",
      headerName: "Customer Name",
      flex: 1,
      minWidth: 150,
      renderCell: ({ row }) => (
        <div className="tableAvatar gap-2" style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar name={row.account_Name} />
          <Link to={`${row._id}`}>{row.account_Name}</Link>
        </div>
      )
    },
    {
      field: "account_UID",
      headerName: "Customer Id",
      flex: 0,
      minWidth: 110,
    },
    {
      field: "account_Address_line_one",
      headerName: "Address",
      flex: 0.7,
      minWidth: 110,
    },
    {
      field: "state_city_country",
      headerName: "State / City / Country",
      flex: 1,
      minWidth: 110,
      renderCell: ({ row }) => (
        <div>
          {row.account_Address_City}, {row.account_Address_State}
          {row.account_Address_Country} - {row.account_Address_PostalCode}
        </div>
      )
    },
    {
      field: "account_StoreAddress",
      headerName: "Store Address",
      flex: 0.7,
      minWidth: 110,
    },
    {
      field: "account_Status",
      headerName: "Status",
      flex: 0,
      minWidth: 110,
      renderCell: ({ row }) => (
        <div>
          {row.account_Status === "active" ? (
              <Badge bg="success" text="light">
                Active
              </Badge>
            ) : (
              <Badge bg="danger" text="light">
                InActive
              </Badge>
          )}
        </div>
      )
    },
    // {
    //   field: "action",
    //   headerName: "Action",
    //   flex: 0.5,
    //   minWidth: 80,
    //   renderCell: ({ row }) => (
    //     <div>
    //       <Link to={`${row._id}`}>
    //         <Tooltip title="View Profile">
    //           <IconButton aria-label="fingerprint" color="secondary">
    //         <MdRemoveRedEye />
    //         </IconButton>
    //         </Tooltip>
    //       </Link>
    //     </div>
    //   ),
    // },
  ]

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage Customer
          </HeadingTwo>
        </Col>
        {RolePermission.Customer && RolePermission.Customer.add === "1" ? (
          <Col md={6} xs={6} className="text-end">
            {/* <Button  onClick={(e) => handleCustomerDrawerToggle()} className="btn primary-btn me-2">Add Customer</Button>  */}
            <Button className="btn success-btn" title="Customer Bulk Import From MYOB" variant="contained" startIcon={<CgImport />} onClick={e => customerBulkImport()}>
              Import From MYOB
            </Button>
            {/* <Tooltip >
                        <IconButton aria-label="fingerprint" color="success" >
                        <CgImport />
                        </IconButton>
                    </Tooltip>     */}
          </Col>
        ) : (
          ""
        )}
      </Row>
      <Row className="SearchBar GeneralHeading mt-1">
        <Col md={12}>
          <form onSubmit={e => searchSubmit(e)}>
            <Row>
              <Col md={6} className="SearchTextBox">
                <TextField onChange={e => searchHandle(e)} className="textarea" required id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
              <Col md={6} className="text-start"></Col>
            </Row>
          </form>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <MyDiv className="BulkUploadLoader">
              <SpanTag>
                <MyDiv className="lds-ring">
                  <MyDiv></MyDiv>
                  <MyDiv></MyDiv>
                  <MyDiv></MyDiv>
                  <MyDiv></MyDiv>
                </MyDiv>
                <br />
                Updating Customer Info... <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
              </SpanTag>
            </MyDiv>
          ) : (
             <MyDiv className="GeneralTable">
                <CommonDataGrid
                  rows={customers?.fetchedItems}
                  columns={columns}
                  rowCount={customers?.totalItems}
                  loading={loading}
                  paginationModel={paginationModel}
                  onPaginationModelChange={setPaginationModel}
                  sortModel={sortModel}
                  onSortModelChange={handleSortModelChange}
                  // sortModel={sortModel}
                  // onSortModelChange={handleSortModelChange}
                  // filterModel={filterModel}
                  // onFilterModelChange={handleFilterModelChange}
                  getRowId={row => row._id}
                  paginationMode="server"
                  filterMode="client"
                  height="75vh"
                  // width="100%"
                  sx={{
                    // Make the grid fill the container and allow horizontal scrolling when needed
                    width: '100%',
                    overflow: 'auto',
                    '& .MuiDataGrid-row': {
                      borderBottom: '1px solid rgba(224, 224, 224, 1)',
                      padding: '10px 5px',
                      alignItems: 'center'
                    },
                    '--DataGrid-rowBorderColor': 'transparent',
                    '& .MuiDataGrid-cell': {
                      padding: '0 8px', // Reduce cell padding for better space usage
                    },
                    '& .MuiTablePagination-displayedRows': {
                      marginBottom: 0
                    }
                  }}
                  rowHeight="auto"
                />
              </MyDiv>
            
          )}
        </Col>
      </Row>
      {/* <MyDiv className="GeneralTable reactPaginate d-flex justify-content-center">
          <Pagination count={pageCount} page={currentPage} onChange={handlePageChange} />
        </MyDiv> */}
      <Drawer anchor="right" open={customerDrawerState} onClose={handleCustomerDrawerToggle}>
        <FormCustomer handleClose={updateDrawer} customerInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerManage;
