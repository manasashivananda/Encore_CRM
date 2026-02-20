import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import axios from "axios";
import FormContact from "./forms";
import { HeadingTwo, MyDiv, HeadingFour, Avatar } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerContactManage() {
  let { id } = useParams();
  const [data, setData] = useState("");
  const [contacts, setContacts] = useState("");
  const [loading, setLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}fetch-account-contact-data/${id}/Store`;
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setContacts(res.data);
    } catch (error) {
      console.error("Contact fetching failed:", error);
      // Optionally show user error message
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const [contactDrawerState, setContactDrawerState] = React.useState(false);
  const handleContactDrawerToggle = () => {
    setData();
    contactDrawerState === false ? setContactDrawerState(true) : setContactDrawerState(false);
  };
  const contactEditId = _id => {
    contactDrawerState === false ? setContactDrawerState(true) : setContactDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    contactDrawerState === false ? setContactDrawerState(true) : setContactDrawerState(false);
    loadContacts();
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading mt-3">
        <Col xs={6}>
          <HeadingTwo>Manage Contacts</HeadingTwo>
        </Col>
        <Col xs={6} className="text-end">
          <Button onClick={e => handleContactDrawerToggle()} className="btn primary-btn">
            Add Contact
          </Button>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Employee table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Contact Name</TableCell>
                      <TableCell align="left">Email</TableCell>
                      <TableCell align="left">Phone</TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {contacts?.length ? (
                      contacts.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row" className="tableAvatar">
                              <Avatar name={item.account_Contact_FName} />
                              <Link>
                                {item.account_Contact_FName}
                                <br /> {item.account_Contact_LName}
                              </Link>
                            </TableCell>
                            <TableCell align="left">{item.account_Contact_Email}</TableCell>
                            <TableCell align="left">{item.account_Contact_Phone}</TableCell>
                            <TableCell align="left">
                              <MyDiv>
                                {item.account_Contact_Status === "active" ? (
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
                                  <IconButton aria-label="fingerprint" color="success" onClick={e => contactEditId(item._id)}>
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
            </MyDiv>
          )}
        </Col>
      </Row>
      <Drawer anchor="right" open={contactDrawerState} onClose={handleContactDrawerToggle}>
        <FormContact handleClose={updateDrawer} contactInfo={data} customerId={id} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerContactManage;
