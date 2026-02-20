import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv, HeadingFour, Avatar } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button, TextField, Pagination } from "@mui/material";
import { MdOutlineModeEditOutline, MdRemoveRedEye } from "react-icons/md";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import FormProduct from "./form";
import MaterialDefaultPriceBulkUpload from "./materialDefaultPriceBulkUpload";
import sampleDocument from "../../Assets/SampleDocs/Sample-flashing-pricebook.xlsx";
import { SiMicrosoftexcel } from "react-icons/si";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ProductManage() {
  let location = useLocation();
  const [data, setData] = useState("");
  const [products, setProducts] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchData, setSearchData] = useState({
    search_text: "",
  });
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);
  let navigate = useNavigate();

  const cancelToken = useRef(null);
  const loadProducts = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;

    setLoading(true);
    const url = API_BASE_URL + `fetch-core-product-data?page=${currentPage - 1}&query=${searchData.search_text}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" }, cancelToken: source.token });
      setProducts(response.data.fetchedItems);
      setPageCount(response.data.totalPages);
    } catch (error) {
      console.log(error);
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [currentPage, searchData.search_text]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };
  /* Search Module */

  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
    setCurrentPage(1);
  }

  function searchSubmit(e) {
    e.preventDefault();
  }

  const [productDrawerState, setProductDrawerState] = React.useState(false);
  const handleProductDrawerToggle = () => {
    setData();
    productDrawerState === false ? setProductDrawerState(true) : setProductDrawerState(false);
  };
  const productEditId = _id => {
    productDrawerState === false ? setProductDrawerState(true) : setProductDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    productDrawerState === false ? setProductDrawerState(true) : setProductDrawerState(false);
    loadProducts();
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage Material
          </HeadingTwo>
        </Col>
        <Col md={6} className="text-end">
          <Button onClick={e => handleProductDrawerToggle()} className="btn primary-btn mx-1">
            Add Material
          </Button>
          <Button component={Link} to="manage-girth-folds" className="btn primary-btn mx-1">
            Manage Girths Folds
          </Button>
        </Col>
      </Row>

      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={7}>
          <form onSubmit={e => searchSubmit(e)}>
            <Row>
              <Col md={7} className="SearchTextBox">
                <TextField onChange={e => searchHandle(e)} className="textarea" required id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
            </Row>
          </form>
        </Col>
        <Col md={5} className="d-flex justify-content-end">
          <MaterialDefaultPriceBulkUpload />
          <Tooltip title="Sample Document">
            <IconButton aria-label="Sample Document" color="success" component="a" href={sampleDocument} download="Sample-flashing-pricebook.xlsx">
              <SiMicrosoftexcel />
            </IconButton>
          </Tooltip>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Material table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Material Name</TableCell>
                      <TableCell align="left">Thickness</TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {products?.length ? (
                      products.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row" className="tableAvatar">
                              <Avatar name={item.core_Product_Name} />
                              <Link to={`${item._id}`}>
                                {item.core_Product_Name} - {item.core_Product_Ref_Id}
                              </Link>
                            </TableCell>
                            <TableCell align="left">{item.core_Product_Thickness}</TableCell>
                            <TableCell align="left">
                              <MyDiv>
                                {item.core_Product_Status === "active" ? (
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
                                  <IconButton aria-label="fingerprint" color="success" onClick={e => productEditId(item._id)}>
                                    <MdOutlineModeEditOutline />
                                  </IconButton>
                                </Tooltip>
                                <Link to={`${item._id}`}>
                                  <Tooltip title="View Profile">
                                    <IconButton aria-label="fingerprint" color="secondary">
                                      <MdRemoveRedEye />
                                    </IconButton>
                                  </Tooltip>
                                </Link>
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
            </MyDiv>
          )}
        </Col>
      </Row>
      <Drawer anchor="right" open={productDrawerState} onClose={handleProductDrawerToggle} disableClose="false">
        <FormProduct handleClose={updateDrawer} productInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default ProductManage;
