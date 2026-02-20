import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Col, Row, Card, Badge } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, Avatar } from "../Common/Components";
import axios from "axios";
import { MdKeyboardArrowLeft } from "react-icons/md";
import NoDataFound from "../Common/noDataFound";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const empId = localStorage.getItem("userId");

function CoreProfile() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    loadPost();
  }, []);

  const loadPost = async () => {
    const url = API_BASE_URL + `fetch-specific-profile/` + empId;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setPosts(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };

  let navigate = useNavigate();

  return (
    <React.Fragment>
      {posts?.length ? (
        posts.map(item => (
          <Row key={item.id}>
            {/* Employee basic Details start */}
            <Col md={12} className="mb-4">
              <MyDiv className="ProfileBasicDetail user-profile">
                <Card className="ProfileBasicDetailLeftHeader">
                  <Row>
                    <Link className="arrow-btn" onClick={() => navigate(-1)}>
                      <MdKeyboardArrowLeft />
                    </Link>
                    <Col md={2} className="text-center">
                      <MyDiv className="profileImageUploader d-flex justify-content-center">
                        <Avatar sx={{ width: 120, height: 120 }} name={item.user_firstName} />
                      </MyDiv>
                      <HeadingFour>
                        {item.user_firstName}&nbsp;{item.user_lastName}
                      </HeadingFour>
                    </Col>
                    <Col md={4} className="text-start">
                      <MyDiv className="ProfileCard">
                        <Row>
                          <Col md={5}>
                            <LabelTag>Full Name</LabelTag>
                          </Col>
                          <Col md={7}>
                            <SpanTag>
                              {item.user_firstName}&nbsp;{item.user_lastName}
                            </SpanTag>
                          </Col>
                        </Row>

                        <Row>
                          <Col md={5}>
                            <LabelTag>Email ID</LabelTag>
                          </Col>
                          <Col md={7}>
                            <SpanTag>{item.user_Email}</SpanTag>
                          </Col>
                        </Row>
                        <Row>
                          <Col md={5}>
                            <LabelTag>Phone Number</LabelTag>
                          </Col>
                          <Col md={7}>
                            <SpanTag>{item.user_Phone}</SpanTag>
                          </Col>
                        </Row>
                        <Row>
                          <Col md={5}>
                            <LabelTag>Role</LabelTag>
                          </Col>
                          <Col md={7}>
                            <SpanTag>{item.role_Names}, </SpanTag>
                          </Col>
                        </Row>
                      </MyDiv>
                    </Col>
                    <Col md={4} className="text-start">
                      <MyDiv className="ProfileCard">
                        <Row>
                          <Col md={5}>
                            <LabelTag>Designation</LabelTag>
                          </Col>
                          <Col md={7}>
                            <SpanTag>{item.user_Designation}</SpanTag>
                          </Col>
                        </Row>
                        <Row>
                          <Col md={5}>
                            <LabelTag>Status</LabelTag>
                          </Col>
                          <Col md={7}>
                            <SpanTag>
                              <Badge bg="success" text="light">
                                {item.user_status}
                              </Badge>
                            </SpanTag>
                          </Col>
                        </Row>
                      </MyDiv>
                    </Col>
                  </Row>
                </Card>
              </MyDiv>
            </Col>
            {/* Employee basic Details */}
          </Row>
        ))
      ) : (
        <NoDataFound />
      )}
    </React.Fragment>
  );
}

export default CoreProfile;
