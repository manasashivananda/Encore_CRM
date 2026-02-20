import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Spinner } from "react-bootstrap";
import { useParams } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Dialog, DialogTitle, DialogContent, Grid, DialogActions, Button, CircularProgress } from "@mui/material";
import { MdOutlineModeEditOutline, MdDelete, MdLocationOn, MdLocationOff, MdVerified } from "react-icons/md";
import axios from "axios";
import FormSiteContact from "./SiteContactform";
import FormSiteAddress from "./SiteAddressform";
import { HeadingTwo, MyDiv, HeadingFour } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const RolePermission = JSON.parse(localStorage.getItem("role"));

function CustomerContactLibrary() {
  let { id } = useParams();
  const [data, setData] = useState("");
  const [contacts, setContacts] = useState("");
  const [Address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [mudMapDialog, setMudMapDialog] = useState(false);
  const [mudMapUrl, setMudMapUrl] = useState("");
  const [mudMapLoading, setMudMapLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}fetch-account-contact-data/${id}/Site`;
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
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAddress = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}fetch-account-address-data/${id}`;
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setAddress(res.data);
    } catch (error) {
      console.error("Address fetching failed:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadContacts();
    loadAddress();
  }, [loadContacts, loadAddress]);

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

  const [addressDrawerState, setAddressDrawerState] = React.useState(false);
  const handleAddressDrawerToggle = () => {
    setData();
    addressDrawerState === false ? setAddressDrawerState(true) : setAddressDrawerState(false);
  };
  const AddressEditId = _id => {
    addressDrawerState === false ? setAddressDrawerState(true) : setAddressDrawerState(false);
    setData(_id);
  };
  const updateAddressDrawer = () => {
    addressDrawerState === false ? setAddressDrawerState(true) : setAddressDrawerState(false);
    loadAddress();
  };

  const contactDeleteId = async item => {
    const url = `${API_BASE_URL}delete-account-site-contact/${item}`;
    try {
      const response = await axios.delete(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      swal.fire({
        text: response.data || "Contact Deleted successfully",
        icon: "success",
      });
      loadContacts();
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
      });
    }
  };

  const addressDeleteId = async item => {
    const url = `${API_BASE_URL}delete-account-site-address/${item}`;
    try {
      const response = await axios.delete(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      swal.fire({
        text: response.data || "Contact Deleted successfully",
        icon: "success",
      });
      loadAddress();
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
      });
    }
  };

  const handleFetchMudMap = async (mudMapKey) => {
    try {
      const url = `${API_BASE_URL}get-mud-map/?mudMapKey=${encodeURIComponent(mudMapKey)}`;
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      return response.data.url;
    } catch (error) {
      console.error("Error fetching mud map:", error);
      throw error;
    }
  };

  const handleMudMapClick = async (mudMapKey, addressId) => {
    setMudMapDialog(true);
    setSelectedAddressId(addressId);
    setMudMapUrl("");
    setSelectedFile(null);

    if (mudMapKey) {
      setMudMapLoading(true);
      try {
        const url = await handleFetchMudMap(mudMapKey);
        setMudMapUrl(url);
      } catch (error) {
        swal.fire({
          text: "Error loading mud map",
          icon: "error",
        });
      } finally {
        setMudMapLoading(false);
      }
    }
  };

  const handleCloseMudMapDialog = () => {
    setMudMapDialog(false);
    setMudMapUrl("");
    setSelectedAddressId(null);
    setSelectedFile(null);
  };

  const handleFileSelect = e => {
    setSelectedFile(Array.from(e.target.files));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploadLoading(true);
    const formData = new FormData();
    selectedFile.forEach(file => {
      formData.append("documents", file);
    });

    try {
      // First upload the file to get the key
      const uploadUrl = `${API_BASE_URL}upload-mud-map`;
      const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "multipart/form-data",
        },
      });

      const mudMapKey = uploadResponse.data.key;

      // Then save the key to the account address
      const updateUrl = `${API_BASE_URL}update-specific-account-address-data/${selectedAddressId}`;
      await axios.patch(
        updateUrl,
        { account_Mud_Map: mudMapKey },
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      // Fetch and display the uploaded mud map
      const mapUrl = await handleFetchMudMap(mudMapKey);
      setMudMapUrl(mapUrl);
      setMudMapDialog(false);
      swal.fire({
        text: "Mud map uploaded successfully",
        icon: "success",
        timer: 1000,
      });

      loadAddress();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Error uploading mud map",
        icon: "error",
      });
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <React.Fragment>
      <Grid container spacing={2}>
        <Grid item md={3.5}>
          <Row className="GeneralHeading mt-3">
            <Col xs={12}>
              <HeadingTwo>Manage Attention Person</HeadingTwo>
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
                          <TableCell align="left">Phone</TableCell>
                          <TableCell align="center">Action</TableCell>
                          {RolePermission && RolePermission?.VerifyCustomerContact?.view === "1" ? (
                          <TableCell align="center">Verified</TableCell>
                          ) : null}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {contacts?.length ? (
                          contacts.map(item => (
                            <React.Fragment key={item._id}>
                              <TableRow>
                                <TableCell align="left" component="th" scope="row" className="tableAvatar">
                                  {item.account_Contact_FName}
                                </TableCell>
                                <TableCell align="left">{item.account_Contact_Phone}</TableCell>
                                <TableCell align="center">
                                  <Box className="custom-flex">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => contactEditId(item._id)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="error" onClick={e => contactDeleteId(item._id)}>
                                        <MdDelete />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                                {RolePermission && RolePermission?.VerifyCustomerContact?.view === "1" ? (
                                  <TableCell align="center">
                                    { item?.account_Contact_Verified ? <MdVerified size={20} color="green"/>: null }
                                  </TableCell>
                                ) : null}
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
        </Grid>
        <Grid item md={8.5}>
          <Row className="GeneralHeading mt-3">
            <Col xs={6}>
              <HeadingTwo>Manage Address</HeadingTwo>
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
                          <TableCell align="left">Site Address</TableCell>
                          <TableCell align="left">City</TableCell>
                          <TableCell align="left">Postal</TableCell>
                          <TableCell align="left">Country</TableCell>
                          <TableCell align="left">State</TableCell>
                          {/* <TableCell align="left">Notes</TableCell> */}
                          <TableCell align="left">Site Info</TableCell>
                          <TableCell align="left">Mud Map</TableCell>
                          <TableCell align="center">Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Address?.length ? (
                          Address.map(item => (
                            <React.Fragment key={item._id}>
                              <TableRow>
                                <TableCell align="left">{item.account_Site_Address_line_one}</TableCell>
                                <TableCell align="left">{item.account_Site_City}</TableCell>
                                <TableCell align="left">{item.account_Site_Postalcode}</TableCell>
                                <TableCell align="left">{item.account_Site_Country}</TableCell>
                                <TableCell align="left">{item.account_Site_State}</TableCell>
                                {/* <TableCell align="left">{item.account_Site_Notes}</TableCell> */}
                                <TableCell align="left">{item.account_Site_Details}</TableCell>
                                <TableCell align="left">
                                  {item?.account_Mud_Map ? 
                                    <Tooltip title="View Mud Map">
                                      <IconButton 
                                        color="primary" 
                                        onClick={() => handleMudMapClick(item.account_Mud_Map, item._id)}
                                      >
                                        <MdLocationOn />
                                      </IconButton>
                                    </Tooltip> 
                                    : 
                                    <Tooltip title="Upload Mud Map">
                                      <IconButton 
                                        color="" 
                                        onClick={() => handleMudMapClick(item.account_Mud_Map, item._id)}
                                      >
                                        <MdLocationOff />
                                      </IconButton>
                                    </Tooltip> 
                                  }
                                </TableCell>
                                <TableCell align="center">
                                  <Box className="custom-flex">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => AddressEditId(item._id)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="error" onClick={e => addressDeleteId(item._id)}>
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
                            <TableCell colSpan={9}>
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
        </Grid>
      </Grid>

      {/* Mud Map Dialog */}
      <Dialog open={mudMapDialog} onClose={handleCloseMudMapDialog} fullWidth maxWidth="md" className="GeneralModal">
        <DialogTitle className="space-between">
          Site Mud Map
          <Button onClick={handleCloseMudMapDialog} className="btn">
            X
          </Button>
        </DialogTitle>
        <DialogContent>
          <MyDiv className="documentContainer">
            <Row>
              {mudMapLoading ? (
                <Box style={{ textAlign: 'center', padding: '40px' }}>
                  <CircularProgress />
                </Box>
              ) : mudMapUrl ? (
                <Box style={{ textAlign: 'center' }}>
                  <img src={mudMapUrl} alt="Mud Map" style={{ maxWidth: '100%', height: '30vh' }} />
                </Box>
              ) : (
                <NoDataFound />
              )}
            </Row>
          </MyDiv>
        </DialogContent>
        <DialogActions className="d-flex justify-content-start flex-column">
          <Row className="dialogFooter">
            <Col md={6} className="">
              <MyDiv className="mb-2">
                <form onSubmit={handleSubmit}>
                <input 
                  type="file" 
                  id="mudMapFile" 
                  name="mudMapFile" 
                  accept="image/*"
                  onChange={handleFileSelect}
                />
                <Button 
                  className="btn primary-btn mb-1" 
                  type="submit" 
                  disabled={uploadLoading}
                >
                  {uploadLoading ? <Spinner animation="border" size="sm" /> : "Upload"}
                </Button>
                </form>
              </MyDiv>
            </Col>
            <Col md={6} className="d-flex justify-content-end"></Col>
          </Row>
        </DialogActions>
      </Dialog>

      <Drawer anchor="right" open={contactDrawerState} onClose={handleContactDrawerToggle}>
        <FormSiteContact handleClose={updateDrawer} contactInfo={data} customerId={id} />
      </Drawer>
      <Drawer anchor="right" open={addressDrawerState} onClose={handleAddressDrawerToggle}>
        <FormSiteAddress handleClose={updateAddressDrawer} addressInfo={data} customerId={id} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerContactLibrary;