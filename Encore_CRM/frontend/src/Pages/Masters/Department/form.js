import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import { roleStatus } from "../../Common/staticjson";
import axios from "axios";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormDepartment({ handleClose, departmentInfo }) {
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    department_name: "",
    department_code: "",
    department_status: "",
  });

  useEffect(() => {
    if (departmentInfo) {
      loadDepartment(departmentInfo);
    }
  }, [departmentInfo]);

  const loadDepartment = async departmentInfoId => {
    const url = API_BASE_URL + `fetch-specific-department-data/` + departmentInfoId;
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
  };

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };

  const handleFieldChange = event => {
    const { name, value } = event.target;

    setData(prevData => ({
      ...prevData,
      [name]: value,
    }));
  };

  const submit = e => {
    e.preventDefault();
    setBtnLoading(true);
    const url = departmentInfo ? `${API_BASE_URL}update-specific-department-data/${departmentInfo}` : `${API_BASE_URL}add-department-data`;
    const method = departmentInfo ? "patch" : "post";
    const formData = { ...data };

    axios({ method, url, data: formData, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
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
      });
  };

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{departmentInfo ? "Edit" : "Add"} Custom order Department</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="department_name" label="Department Name" value={data.department_name} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField required id="department_code" label="Department Code" value={data.department_code} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="department_status"
                      id="department_status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.department_status, onChange: handleFieldChange }}
                    >
                      {roleStatus.map(roleStatus => (
                        <MenuItem key={roleStatus.value} value={roleStatus.value}>
                          {roleStatus.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>

                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <span aria-live="polite" className="d-inline-flex align-items-center">
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          <span className="visually-hidden">Please wait...</span>
                        </span>
                      </Button>
                    ) : (
                      <button type="submit" className="FormBtn">
                        Submit
                      </button>
                    )}
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
export default FormDepartment;
