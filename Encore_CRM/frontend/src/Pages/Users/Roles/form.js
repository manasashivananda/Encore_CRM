import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner } from "react-bootstrap";
import { TextField, MenuItem, Button } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { roleStatus, roleCate } from "../../Common/staticjson";
import CustomSwal from '../../Common/customSwal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

export const initialDept = {
        department_name: "Flashing",
        department_code: "F",
        department_status: "active",
    }

function FormRoles({ handleClose, roleInfo }) {
  const [btnLoading, setBtnLoading] = useState(false);
  let roleInfoId = roleInfo;
  const [data, setData] = useState(
    {
      role_Name: "",
      role_category: "",
      role_status: "",
       depts: []
    },
    []
  );

  const [departments, setDepartments] = useState([])

    useEffect(() => {
        loadDepartment();
    }, []);
    
    const loadDepartment = async () => {
        var url = API_BASE_URL + `fetch-department-data`;
        axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })
        .then(res => {
            const activeData = res.data.filter((item) => item.department_status.toLowerCase() === 'active' && item.department_code.toLowerCase() !== "gbil")
            activeData.unshift(initialDept)
            setDepartments(activeData);
        })
        .catch(error => {
            CustomSwal.toast.info("Department fetching failed.")
        });
    }
  const loadSpecificRole = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-role-data/` + roleInfoId;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setData(res.data[0]);
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      });
  }, [roleInfoId]);

  useEffect(() => {
    if (roleInfo !== undefined) {
      loadSpecificRole();
    }
  }, [loadSpecificRole, roleInfo]);

  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };

  const handleChange = e => {
    const newdata = { ...data };
    newdata[e.target.id] = e.target.value;
    setData(newdata);
  };

  function submit(e) {
    setBtnLoading(true);
    e.preventDefault();
    const url = roleInfoId ? API_BASE_URL + "update-role-data/" + roleInfoId : API_BASE_URL + "add-role-data";
    const method = roleInfoId ? "patch" : "post";
    axios({ method, url, data, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: "Successfully Saved",
            icon: "success",
            type: "success",
          });
          handleClose();
          setBtnLoading(false);
        }
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
        setBtnLoading(false);
      });
  }
  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{roleInfo ? "Edit" : "Add"} Roles</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="role_Name" label="Role Name" value={data.role_Name} variant="standard" onChange={e => handleChange(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField select name="role_category" id="role_category" variant="standard" label="Category" SelectProps={{ value: data.role_category, onChange: handleFieldChange }}>
                      <MenuItem value="">--Select---</MenuItem>
                      {roleCate.map(roleCate => (
                        <MenuItem key={roleCate.value} value={roleCate.value}>
                          {roleCate.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12}>
                    <TextField select required name="depts" id="depts" variant="standard" label="Department" SelectProps={{ multiple: true, value: data.depts, onChange: handleFieldChange }} >
                        {departments.map((item, index) => (
                        <MenuItem key={index} value={item.department_code}>{item.department_name}</MenuItem>
                        ))}
                    </TextField>
                </Col>
                  <Col md={12}>
                    <TextField select required name="role_status" id="role_status" variant="standard" label="Status" SelectProps={{ value: data.role_status, onChange: handleFieldChange }}>
                      {roleStatus.map(roleStatus => (
                        <MenuItem key={roleStatus.value} value={roleStatus.value}>
                          {roleStatus.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12} className="text-end">
                    <Button className="FormBtn" type="submit" disabled={btnLoading}>
                      {btnLoading ? <Spinner animation="border" size="sm" /> : "Submit"}
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
}
export default FormRoles;
