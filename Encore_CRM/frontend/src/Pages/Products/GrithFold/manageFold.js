import React, { useState, useEffect } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import axios from "axios";
import { HeadingTwo, MyDiv, HeadingFour } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import FormFold from "./formFold";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FoldsManage() {
  const [data, setData] = useState("");
  const [folds, setFolds] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFolds();
  }, []);

  const loadFolds = async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-product-fold-data`;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      //axios.get(url)
      .then(
        res => {
          setFolds(res.data);
        },
        error => {
          console.log(error);
        }
      );
    setLoading(false);
  };

  const [foldDrawerState, setFoldDrawerState] = React.useState(false);
  const handleFoldDrawerToggle = () => {
    setData();
    foldDrawerState === false ? setFoldDrawerState(true) : setFoldDrawerState(false);
  };
  const foldEditId = _id => {
    foldDrawerState === false ? setFoldDrawerState(true) : setFoldDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    foldDrawerState === false ? setFoldDrawerState(true) : setFoldDrawerState(false);
    loadFolds();
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading">
        <Col md={6}>
          <HeadingTwo>Manage Folds</HeadingTwo>
        </Col>
        <Col md={6} className="text-end">
          <Button onClick={e => handleFoldDrawerToggle()} className="btn primary-btn mx-1">
            Add Folds
          </Button>
        </Col>
      </Row>
      <MyDiv className="GeneralTable">
        <Row className="">
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <TableContainer>
              <Table className="bgGrey" aria-label="Fold table">
                <TableHead>
                  <TableRow>
                    <TableCell align="left">Fold Count</TableCell>
                    <TableCell align="left">Status</TableCell>
                    <TableCell align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {folds?.length ? (
                    folds.map(item => (
                      <React.Fragment key={item._id}>
                        <TableRow>
                          <TableCell align="left" component="th" scope="row">
                            {item.product_Fold}
                          </TableCell>
                          <TableCell align="left">
                            <MyDiv>
                              {item.product_Fold_Status === "active" ? (
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
                                <IconButton aria-label="fingerprint" color="success" onClick={e => foldEditId(item._id)}>
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
          )}
        </Row>
      </MyDiv>
      <Drawer anchor="right" open={foldDrawerState} onClose={handleFoldDrawerToggle} disableClose="false">
        <FormFold handleClose={updateDrawer} foldInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default FoldsManage;
