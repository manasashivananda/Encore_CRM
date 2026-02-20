import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv, InputField } from "../Common/Components";
import { Card, Col, Row, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import Swal from "sweetalert2";
import { employeeStatus, region } from "../Common/staticjson";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const FormUser = ({ handleClose, userInfo }) => {
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    user_firstName: "",
    user_lastName: "",
    user_Email: "",
    user_Phone: "",
    user_Designation: "",
    user_status: "",
    user_Role: [],
    region : ""
  });
    const [roles, setRoles] = useState([]);

  // Fetch specific user data for editing
  const loadSpecificUser = useCallback(async () => {
    if (!userInfo) return;
    try {
      const url = `${API_BASE_URL}fetch-specific-user-data/${userInfo}`;
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setData(response.data[0] || {});
    } catch (error) {
      Swal.fire({
        text: error.response?.data?.message || "Failed to fetch user data",
        icon: "error",
      });
    }
  }, [userInfo]);

  // Fetch available roles for dropdown
  const loadUserRole = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}fetch-role-data-dropdown`;
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setRoles(response.data || []);
    } catch (error) {
      Swal.fire({
        text: error.response?.data?.message || "Failed to fetch roles",
        icon: "error",
      });
    }
  }, []);

  // Unified input change handler
  const handleChange = useCallback(e => {
    const { id, name,  value, isValid } = e;
    if (e.type === "phone" && !isValid && value) return; // Ignore invalid phone numbers
    setData(prev => ({ ...prev, [id || name]: value }));
  }, []);

  // Handle form submission
  const handleSubmit = async e => {
    e.preventDefault();
    setBtnLoading(true);
    try {
      const url = userInfo ? `${API_BASE_URL}update-specific-user-data/${userInfo}` : `${API_BASE_URL}add-user-data`;
      const method = userInfo ? "patch" : "post";
      const response = await axios({
        method,
        url,
        data,
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      if (response.status === 200) {
        Swal.fire({
          text: "Successfully Saved",
          icon: "success",
        });
        handleClose();
      }
    } catch (error) {
      Swal.fire({
        text: error.response?.data || "Invalid Data. Please Recheck the Data",
        icon: "error",
      });
    } finally {
      setBtnLoading(false);
    }
  };

  // Load roles on mount
  useEffect(() => {
    loadUserRole();
  }, [loadUserRole]);

  // Load user data or reset form
  useEffect(() => {
    if (userInfo) {
      loadSpecificUser();
    } else {
      setData({
        user_firstName: "",
        user_lastName: "",
        user_Email: "",
        user_Phone: "",
        user_Designation: "",
        user_status: "",
        user_Role: [],
        region: ""
      });
    }
  }, [userInfo, loadSpecificUser]);

  // Map roles to options format
  const roleOptions = roles.map(role => ({
    value: role._id,
    label: role.role_Name,
  }));

  // Use employeeStatus for status options
  const statusOptions = employeeStatus;

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card>
          <Card.Header>
            <HeadingFour className="card-title">{userInfo ? "Edit" : "Add"} Users</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={handleSubmit}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <InputField type="text" id="user_firstName" label="First Name" value={data.user_firstName} onChange={handleChange} required validationType="alphanumeric" />
                  </Col>
                  <Col md={12}>
                    <InputField type="text" id="user_lastName" label="Last Name" value={data.user_lastName} onChange={handleChange} required validationType="alphanumeric" />
                  </Col>
                  <Col md={12}>
                    <InputField type="email" id="user_Email" label="Email ID" value={data.user_Email} onChange={handleChange} required />
                  </Col>
                  <Col md={12}>
                    <InputField type="phone" id="user_Phone" label="Phone Number" value={data.user_Phone} onChange={handleChange} required />
                  </Col>
                  <Col md={12}>
                    <InputField type="select" id="user_status" label="Status" value={data.user_status} onChange={handleChange} options={statusOptions} required />
                  </Col>
                  <Col md={12}>
                    <InputField type="text" id="user_Designation" label="Designation" value={data.user_Designation} onChange={handleChange} required validationType="alphanumeric" />
                  </Col>
                  {/* <Col md={12}>
                    <InputField type="select" id="region" label="Region" value={data.region} onChange={handleChange} options={region} required />
                  </Col> */}
                  <Col md={12}>
                    <InputField type="select" id="user_Role" label="Role" value={data.user_Role} onChange={handleChange} options={roleOptions} required multiple />
                  </Col>
                  <Col md={12} className="text-end">
                    <Button type="submit" className="mt-4 FormBtn" disabled={btnLoading}>
                      {btnLoading ? (
                        <>
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          Please wait...
                        </>
                      ) : (
                        "Submit"
                      )}
                    </Button>
                  </Col>
                </Row>
              </form>
            </MyDiv>
          </Card.Body>
        </Card>
      </MyDiv>
    </MyDiv>
  );
};

FormUser.propTypes = {
  handleClose: PropTypes.func.isRequired,
  userInfo: PropTypes.string,
};

export default FormUser;
