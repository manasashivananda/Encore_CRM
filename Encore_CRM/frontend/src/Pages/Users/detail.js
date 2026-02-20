import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, Avatar } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import swal from "sweetalert2";
import NoDataFound from "../Common/noDataFound";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function UserDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState("");

  const loadSpecificUser = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-user-data/` + id;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setUser(res.data);
      },
      error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      }
    );
    setLoading(false);
  }, [id]);

  let navigate = useNavigate();

  useEffect(() => {
    loadSpecificUser();
  }, [loadSpecificUser]);

  return (
    <React.Fragment>
      {loading ? (
        <HeadingFour className="text-center">Loading...</HeadingFour>
      ) : (
        <>
          {user?.length > 0 ? (
            user.map(item => (
              <React.Fragment key={item._id}>
                <Row>
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
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Role</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.role_Names},&nbsp; </SpanTag>
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

export default UserDetail;
