import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import { roleStatus } from "../../Common/staticjson";
import axios from "axios";
import swal from "sweetalert2";
import { useParams } from "react-router-dom";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormSubDepartment({ handleClose, subDepartInfo }) {
  const { id } = useParams();
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    department_child_name: "",
    department_child_status: "",
  });

  useEffect(() => {
    if (subDepartInfo !== undefined) {
      const loadSubDepartment = async () => {
        const url = API_BASE_URL + `fetch-specific-department-child-data/` + subDepartInfo;
        try {
          const response = await axios.get(url, {
            headers: {
              "x-access-token": localStorage.getItem("token"),
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          });
          setData(response.data[0]);
        } catch (error) {
          swal.fire({
            text: error.response.data,
            icon: "error",
            type: "error",
          });
        }
      };
      loadSubDepartment();
    } else {
      setData({
        department_child_name: "",
        department_child_status: "",
      });
    }
  }, [subDepartInfo]);

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };

  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };
  const submit = e => {
    e.preventDefault();
    setBtnLoading(true);
    const url = subDepartInfo ? `${API_BASE_URL}update-specific-department-child-data/${subDepartInfo}` : `${API_BASE_URL}add-department-child-data/${id}`;
    const method = subDepartInfo ? "patch" : "post";

    axios({
      method,
      url,
      data,
      headers: {
        "x-access-token": localStorage.getItem("token"),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
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
            <HeadingFour className="card-title">{subDepartInfo ? "Edit" : "Add"} Sub Department</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={submit}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="department_child_name" label="Sub Department Name" value={data.department_child_name} variant="standard" onChange={handleChangeWhiteSpace} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="department_child_status"
                      id="department_child_status"
                      variant="standard"
                      label="Status"
                      SelectProps={{
                        value: data.department_child_status,
                        onChange: handleFieldChange,
                      }}
                    >
                      {roleStatus.map(departmentChildStatus => (
                        <MenuItem key={departmentChildStatus.value} value={departmentChildStatus.value}>
                          {departmentChildStatus.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="mx-2" />
                        Please Wait...
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

export default FormSubDepartment;
