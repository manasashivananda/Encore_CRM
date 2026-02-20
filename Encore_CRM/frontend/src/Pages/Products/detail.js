import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, Avatar } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import ColorManage from "./Colors/colorManage";
import ManageMaterialPrice from "./PriceBook/priceManage";
import { Tabs, Tab, Box } from "@mui/material";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ProductDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState("");
  const [activeTab, setActiveTab] = useState("Colors");
  let navigate = useNavigate();

  const loadSpecificProject = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-core-product-data/` + id;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setProject(res.data);
      })
      .catch(error => {
        console.log(error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadSpecificProject();
  }, [loadSpecificProject]);

  const handleTabChange = (event, newTab) => {
    setActiveTab(newTab);
  };

  return (
    <React.Fragment>
      {loading ? (
        <HeadingFour className="text-center">Loading...</HeadingFour>
      ) : (
        <>
          {project?.length ? (
            project.map(item => (
              <React.Fragment key={item._id}>
                <Row>
                  {/* Product basic Details start */}
                  <Col md={12} className="mb-4">
                    <MyDiv className="ProfileBasicDetail project-profile">
                      <Card className="ProfileBasicDetailLeftHeader">
                        <Row>
                          <Link className="arrow-btn" onClick={() => navigate(-1)}>
                            <MdKeyboardArrowLeft />
                          </Link>
                          <Col md={2} className="text-center">
                            <MyDiv className="profileImageUploader d-flex justify-content-center">
                              <Avatar name={item.core_Product_Name} sx={{ width: 120, height: 120 }} />
                            </MyDiv>
                            <HeadingFour>{item.core_Product_Name}</HeadingFour>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Material Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.core_Product_Name}</SpanTag>
                                </Col>
                              </Row>

                              <Row>
                                <Col md={5}>
                                  <LabelTag>Thickness</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.core_Product_Thickness}</SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Material Ref Code</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.core_Product_Ref_Id} </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Status</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.core_Product_Status === "active" ? (
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
                            </MyDiv>
                          </Col>
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                  {/* Product basic Details */}
                </Row>
                <Row>
                  <Col md={12}>
                    <MyDiv className="GeneralHeading pb-0">
                      <Box sx={{ maxWidth: { xs: 320, md: 1000 } }}>
                        <Tabs value={activeTab} onChange={handleTabChange} textColor="#d22530" variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: "#d22530" } }}>
                          <Tab label="Colors" value="Colors" />
                          <Tab label="Price Book" value="PriceBook" />
                        </Tabs>
                      </Box>
                    </MyDiv>
                    {activeTab === "Colors" && <ColorManage />}
                    {activeTab === "PriceBook" && <ManageMaterialPrice />}
                  </Col>
                </Row>
              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}
    </React.Fragment>
  );
}

export default ProductDetail;
