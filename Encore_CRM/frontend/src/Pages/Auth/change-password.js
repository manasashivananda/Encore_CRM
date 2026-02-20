import React from "react";
import { useNavigate } from "react-router-dom";
import { Col, Row, Card } from "react-bootstrap";
import { HeadingFour, MyDiv } from "../Common/Components";
import Form from "react-bootstrap/Form";
import { useForm } from "react-hook-form";
import axios from "axios";
import swal from "sweetalert2";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";
import CryptoJS from "crypto-js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const API_MYID = localStorage.getItem("userId");
const SECRET_KEY = process.env.REACT_APP_SECRET_KEY;

function CoreChangePassword() {
  const navigate = useNavigate();

  const validationSchema = Yup.object().shape({
    user_ref_id: Yup.string(),
    currentPassword: Yup.string().required("Current password is required").min(6, "Password must be at least 6 characters"),
    newPassword: Yup.string().required("New password is required").min(6, "Password must be at least 6 characters"),
    confirmPassword: Yup.string()
      .required("Confirm password is required")
      .oneOf([Yup.ref("newPassword")], "Passwords must match"),
  });

  const formOptions = { resolver: yupResolver(validationSchema) };
  const { register, handleSubmit, reset, formState } = useForm(formOptions);
  const { errors } = formState;

  const onSubmit = (data, e) => {
    e.preventDefault();

    const encryptedCurrentPassword = CryptoJS.AES.encrypt(data.currentPassword, SECRET_KEY).toString();
    const encryptedNewPassword = CryptoJS.AES.encrypt(data.newPassword, SECRET_KEY).toString();

    const url = API_BASE_URL + "user-change-password";
    const method = "post";

    const requestData = {
      user_ref_id: API_MYID,
      currentPassword: encryptedCurrentPassword,
      newPassword: encryptedNewPassword,
    };

    axios({ method, url, data: requestData, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: "Successfully Updated, Please login again",
            icon: "success",
            type: "success",
          });
          navigate("/");
        }
      })
      .catch(error => {
        swal.fire({
          text: error.response?.data || "An error occurred",
          icon: "error",
          type: "error",
        });
      });

    reset();
    return false;
  };

  return (
    <MyDiv>
      <Row className="mt-15 my-5 justify-content-center">
        <Col md={5}>
          <Card className="LayoutCard">
            <Card.Header>
              <Row>
                <Col md={11}>
                  <HeadingFour className="card-title float-left">Change Password</HeadingFour>
                </Col>
              </Row>
            </Card.Header>
            <Card.Body>
              <form onSubmit={handleSubmit(onSubmit)}>
                <Row className="mb-4">
                  <Col md={4}>
                    <Form.Label>Current Password </Form.Label>
                  </Col>
                  <Col md={7}>
                    <Form.Control type="hidden" name="user_ref_id" value={API_MYID} {...register("user_ref_id")} />
                    <Form.Control type="password" placeholder="Current Password" {...register("currentPassword")} className={`form-control ${errors.currentPassword ? "is-invalid" : ""}`} />
                    <div className="invalid-feedback">{errors.currentPassword?.message}</div>
                  </Col>
                </Row>
                <Row className="mb-4">
                  <Col md={4}>
                    <Form.Label>New Password </Form.Label>
                  </Col>
                  <Col md={7}>
                    <Form.Control type="password" placeholder="New Password" {...register("newPassword")} className={`form-control ${errors.newPassword ? "is-invalid" : ""}`} />
                    <div className="invalid-feedback">{errors.newPassword?.message}</div>
                  </Col>
                </Row>
                <Row className="mb-4">
                  <Col md={4}>
                    <Form.Label>Confirm Password </Form.Label>
                  </Col>
                  <Col md={7}>
                    <Form.Control type="password" placeholder="Confirm Password" {...register("confirmPassword")} className={`form-control ${errors.confirmPassword ? "is-invalid" : ""}`} />
                    <div className="invalid-feedback">{errors.confirmPassword?.message}</div>
                  </Col>
                </Row>
                <Row className="mb-4">
                  <Col md={4}></Col>
                  <Col md={7}>
                    <MyDiv>
                      <button type="submit" className="btn primary-btn">
                        Change Password
                      </button>
                      &nbsp;
                      <button type="button" onClick={() => reset()} className="btn secondary-btn">
                        Reset
                      </button>
                    </MyDiv>
                  </Col>
                </Row>
              </form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </MyDiv>
  );
}

export default CoreChangePassword;
