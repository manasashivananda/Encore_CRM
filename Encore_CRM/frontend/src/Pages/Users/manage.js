import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, Avatar } from "../Common/Components";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { IconButton, Tooltip, Drawer, Button, TextField } from "@mui/material";
import { MdOutlineModeEditOutline, MdKeyboardArrowLeft } from "react-icons/md";
import axios from "axios";
import Swal from "sweetalert2";
import FormUser from "./forms";
import CommonDataGrid from "../Common/commonDataGrid";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function UsersManage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [sortModel, setSortModel] = useState([]);
  const [paginationModel, setPaginationModel] = useState({
    page: parseInt(new URLSearchParams(location.search).get("page")) - 1 || 0,
    pageSize: 5,
  });
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [userDrawerState, setUserDrawerState] = useState(false);
  const abortControllerRef = useRef(null);

  // Memoized function to fetch users with sorting, pagination, and search
  const loadUsers = useCallback(async () => {
    setLoading(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Create new AbortController
    abortControllerRef.current = new AbortController();
    const sortField = sortModel[0]?.field || "user_firstName";
    const sortOrder = sortModel[0]?.sort || "asc";
    const url = `${API_BASE_URL}fetch-user-data?page=${paginationModel.page}&pageSize=${
      paginationModel.pageSize
    }&query=${encodeURIComponent(searchData.search_text)}&sortField=${sortField}&sortOrder=${sortOrder}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: abortControllerRef.current.signal,
      });
      setUsers(response.data.fetchedItems || []);
      setTotalItems(response.data.totalItems || 0);
      if (response.data.rowsPerPage && response.data.rowsPerPage !== paginationModel.pageSize) {
        setPaginationModel(prev => ({ ...prev, pageSize: response.data.rowsPerPage }));
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log("Request canceled:", error.message);
      } else {
        Swal.fire({
          text: error.response?.data?.message || "Failed to fetch users",
          icon: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [searchData.search_text, paginationModel, sortModel]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set("page", paginationModel.page + 1);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [paginationModel.page, navigate, location.pathname, location.search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = useCallback(e => {
    setSearchData({ search_text: e.target.value });
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, []);

  const handleSearchSubmit = e => {
    e.preventDefault();
    loadUsers();
  };

  const toggleDrawer = useCallback(() => {
    setData(null);
    setUserDrawerState(prev => !prev);
  }, []);

  const handleUserEdit = useCallback(id => {
    setData(id);
    setUserDrawerState(true);
  }, []);

  const updateDrawer = useCallback(() => {
    setUserDrawerState(false);
    loadUsers();
  }, [loadUsers]);

  const handleSortModelChange = useCallback(model => {
    setSortModel(model);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, []);

  const columns = [
    {
      field: "user_firstName",
      headerName: "User Name",
      flex: 1,
      sortable: true,
      renderCell: ({ row }) => (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Avatar round="50px" size="40" name={row.user_firstName} src="" />
          <Link to={`/users/${row._id}`}>
            {row.user_firstName} {row.user_lastName}
          </Link>
        </div>
      ),
    },
    {
      field: "user_Email",
      headerName: "Email",
      flex: 1,
      sortable: true,
    },
    {
      field: "user_Phone",
      headerName: "Phone",
      flex: 1,
      sortable: true,
    },
    {
      field: "user_Designation",
      headerName: "Designation",
      flex: 1,
      sortable: true,
    },
    {
      field: "roleName",
      headerName: "Role",
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => row.roleName?.join(", ") || "",
    },
    // {
    //   field: "region",
    //   headerName: "Region",
    //   flex: 1,
    //   sortable: false,
    //   // renderCell: ({ row }) => row.roleName?.join(", ") || "",
    // },
    {
      field: "user_status",
      headerName: "Status",
      flex: 1,
      sortable: true,
      renderCell: ({ row }) => (
        <Badge bg={row.user_status === "active" ? "success" : "danger"} text="light">
          {row.user_status === "active" ? "Active" : "InActive"}
        </Badge>
      ),
    },
    {
      field: "action",
      headerName: "Action",
      flex: 1,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Tooltip title="Edit">
          <IconButton color="success" onClick={() => handleUserEdit(row._id)}>
            <MdOutlineModeEditOutline />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage User
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={toggleDrawer} className="btn primary-btn">
            Add User
          </Button>
        </Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={12}>
          <form onSubmit={handleSearchSubmit}>
            <Row>
              <Col md={4} className="SearchTextBox">
                <TextField
                  onChange={handleSearch}
                  id="search_text"
                  placeholder="Enter Search Text Here..."
                  value={searchData.search_text}
                  variant="standard"
                  fullWidth
                />
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <CommonDataGrid
                rows={users}
                columns={columns}
                rowCount={totalItems}
                loading={loading}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                sortModel={sortModel}
                onSortModelChange={handleSortModelChange}
                getRowId={row => row._id}
                paginationMode="server"
                sortingMode="server"
              />
            </MyDiv>
          )}
        </Col>
      </Row>
      <Drawer anchor="right" open={userDrawerState} onClose={toggleDrawer}>
        <FormUser handleClose={updateDrawer} userInfo={data} />
      </Drawer>
    </>
  );
}

export default UsersManage;
