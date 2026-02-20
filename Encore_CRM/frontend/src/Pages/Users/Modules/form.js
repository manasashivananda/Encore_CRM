import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../../Common/staticjson";
import PropTypes from "prop-types";

FormModules.propTypes = {
  handleClose: PropTypes.func.isRequired,
  modulesInfo: PropTypes.object,
};

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormModules({ handleClose, modulesInfo }) {
  let modulesInfoId = modulesInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    modules_Name: "",
    modules_Status: "",
  });

  const loadSpecificModules = useCallback(() => {
    const url = `${API_BASE_URL}fetch-specific-modules-data/${modulesInfoId}`;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(
        res => {
          setData(res.data[0]);
        },
        error => {
          swal.fire({
            text: error.response.data,
            icon: "error",
            type: "error",
          });
        }
      );
  }, [modulesInfoId]);

  useEffect(() => {
    if (modulesInfo !== undefined) {
      loadSpecificModules();
    }
  }, [loadSpecificModules, modulesInfo]);

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
  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = modulesInfoId ? API_BASE_URL + "update-specific-modules-data/" + modulesInfoId : API_BASE_URL + "add-modules-data";
    const method = modulesInfoId ? "patch" : "post";
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
      });
  }
  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{modulesInfo ? "Edit" : "Add"} Modules</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="modules_Name" label="Modules Name" value={data.modules_Name} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField select required name="modules_Status" id="modules_Status" variant="standard" label="Status" SelectProps={{ value: data.modules_Status, onChange: handleFieldChange }}>
                      {cusStatus.map(modulesStatus => (
                        <MenuItem key={modulesStatus.value} value={modulesStatus.value}>
                          {modulesStatus.label}
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
export default FormModules;
