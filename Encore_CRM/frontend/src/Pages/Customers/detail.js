import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, Avatar } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useParams } from "react-router-dom";
import CustomerContactManage from "./Contacts/manage";
import CustomerOrderManage from "./Orders/manage";
import axios from "axios";
import swal from "sweetalert2";
import NoDataFound from "../Common/noDataFound";
import CustomerPriceBookManage from "./PriceBook/manage";
import CustomerCustomItemPriceBookManage from "./CustomItemPricebook/manage";
import CustomerContactLibrary from "./Contacts/contactLibrary";
import CustomerFeedback from "./CustomerFeedback/feedback"
import { Tabs, Tab, Box, Drawer, Button } from "@mui/material";
import FormCustomerNotes from "./CustomerNotes/customerNotesForm";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState("");
  const [activeTab, setActiveTab] = useState("Contacts");

  let navigate = useNavigate();

  const loadSpecificCustomer = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-specific-account-data/${id}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setCustomer(res.data);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Something went wrong",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSpecificCustomer();
  }, [loadSpecificCustomer]);

  const handleTabChange = (event, newTab) => {
    setActiveTab(newTab);
  };

  const PriceUpdated = () => {
    loadSpecificCustomer();
  };

  // Customer notes details
    const [data, setData] = useState({});
    const [contacts, setContacts] = useState("");
  
    const loadContacts = useCallback(async () => {
      setLoading(true);
      try {
        const url = `${API_BASE_URL}fetch-customer-notes/${id}`;
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
    const contactEdit  = (item) => {
      contactDrawerState === false ? setContactDrawerState(true) : setContactDrawerState(false);
      setData(item);
    };
    const updateDrawer = () => {
      contactDrawerState === false ? setContactDrawerState(true) : setContactDrawerState(false);
      loadContacts();
      loadSpecificCustomer();
    };

  return (
    <React.Fragment>
      {loading ? (
        <HeadingFour className="text-center">Loading...</HeadingFour>
      ) : (
        <>
          {customer?.length ? (
            customer.map(item => (
              <React.Fragment key={item._id}>
                <Row>
                  {/* Customer basic Details start */}
                  <Col md={12} className="mb-4">
                    <MyDiv className="ProfileBasicDetail user-profile">
                      <Card className="ProfileBasicDetailLeftHeader">
                        <Row>
                          <Link className="arrow-btn" onClick={() => navigate(-1)}>
                            <MdKeyboardArrowLeft />
                          </Link>
                          <Col md={2} className="text-center">
                            <MyDiv className="profileImageUploader d-flex justify-content-center">
                              {/* <MyDiv className="uploadIcon"> <MdOutlineCloudUpload /></MyDiv>
                                        <input type="file" onChange={handleChange} /> */}
                              <Avatar sx={{ width: 120, height: 120 }} name={item.account_Name} />
                            </MyDiv>
                            <HeadingFour>{item.account_Name}</HeadingFour>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Company Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_Name}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Customer ID</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_UID}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Customer Email</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_Address_Email}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Customer Phone</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_Address_Phone}</SpanTag>
                                </Col>
                              </Row>
                              <Row className="hide">
                                <Col md={5}>
                                  <LabelTag>Flashing PriceBook</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.account_Flashing_Item_Price_Assignment === true ? (
                                      <Badge bg="success" text="light">
                                        Assigned
                                      </Badge>
                                    ) : (
                                      <Badge bg="danger" text="light">
                                        Not Assigned
                                      </Badge>
                                    )}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Custom Items PriceBook</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.account_Custom_Item_Price_Assignment === true ? (
                                      <Badge bg="success" text="light">
                                        Assigned
                                      </Badge>
                                    ) : (
                                      <Badge bg="danger" text="light">
                                        Not Assigned
                                      </Badge>
                                    )}
                                  </SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Address</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.account_Address_line_one}
                                    <br />
                                    {item.account_Address_City}, {item.account_Address_State}
                                    <br />
                                    {item.account_Address_Country} - {item.account_Address_PostalCode}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Store Address</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_StoreAddress}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Terms</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_Terms}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Status</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.account_Status === "active" ? (
                                      <Badge bg="success" text="light">
                                        Active
                                      </Badge>
                                    ) : (
                                      <Badge bg="danger" text="light">
                                        InActive
                                      </Badge>
                                    )}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Notes</LabelTag>
                                </Col>
                                <Col md={6} className="mb-2 d-flex align-items-center gap-2">
                                    <SpanTag>{item.accounts_Notes}</SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                          <Col md={2} className="d-flex justify-content-end">
                            <MyDiv>
                              <Row>
                                {contacts?.length ? (
                                  contacts.map((item) => (
                                    <>
                                    <Col md={12} id={item._id} >
                                    {item.notes ? (
                                      <Button
                                        style={{ fontSize: '12px', padding: '2px 6px' }}
                                        onClick={() => {
                                          contactEdit(item); 
                                        }}
                                        className="btn primary-btn"
                                      >
                                        Edit Note
                                      </Button>
                                    ):(
                                      <Button
                                        style={{ fontSize: '12px', padding: '2px 6px' }}
                                        onClick={() => handleContactDrawerToggle()}
                                        className="btn primary-btn"
                                      >
                                        Add Note
                                      </Button>
                                    )}
                                    </Col>
                                    </>
                                  ))
                                ) : (
                                  null
                                )}
                              </Row>
                            </MyDiv>
                          </Col>
                          {/* <Col md={{ span: 1, offset: 1 }} className="text-end">
                                        {RolePermission.CustomerModules && RolePermission.CustomerModules.edit === "1" ? <Tooltip title="Edit">
                                            <IconButton aria-label="fingerprint" color="success" onClick={(e) => CustomerEditId(item._id)}>
                                                <Edit />
                                            </IconButton>
                                        </Tooltip> : ""}
                                    </Col> */}
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                  {/* Customer basic Details */}
                </Row>
                {/* <Row>
                                    <Col md={12} xxl={6}>
                                        <CustomerContactManage />
                                    </Col>
                                    <Col md={12} xxl={6}>
                                        <CustomerOrderManage />
                                    </Col>
                                </Row> */}
                <Row>
                  <Col md={12}>
                    <MyDiv className="GeneralHeading pb-0">
                      <Box sx={{ maxWidth: { xs: 320, md: 1100 }, bgcolor: "background.paper" }}>
                        <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: "#d22530" } }}>
                          <Tab label="Contacts" value="Contacts" />
                          <Tab label="Library" value="Library" />
                          <Tab label="Orders" value="Orders" />
                          <Tab label="Flashing Item Price Book" value="FlashingPrice" />
                          <Tab label="Custom Item Price Book" value="CustomPrice" />
                          <Tab label="Customer Feedback" value="CustomerFeedback" />
                          {/* <Tab label="Notes" value="Notes" /> */}
                        </Tabs>
                      </Box>
                    </MyDiv>
                    {activeTab === "Contacts" && <CustomerContactManage />}
                    {activeTab === "Library" && <CustomerContactLibrary />}
                    {activeTab === "Orders" && <CustomerOrderManage />}

                    {activeTab === "FlashingPrice" && <CustomerPriceBookManage />}
                    {activeTab === "CustomPrice" && <CustomerCustomItemPriceBookManage handleCustomItemResponse={PriceUpdated} />}
                    {activeTab === "CustomerFeedback" && <CustomerFeedback />}
                  </Col>
                </Row>
              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}
      <Drawer anchor="right" open={contactDrawerState} onClose={handleContactDrawerToggle}>
        <FormCustomerNotes handleClose={updateDrawer} noteData={data} customerId={id} />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerDetail;
