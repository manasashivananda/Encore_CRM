import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { rackStatus } from "../../Common/staticjson";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormRacking({ handleClose, rackingInfo }) {
  let rackingInfoId = rackingInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    rack_name: "",
    rack_code: "",
    rack_status: "",
  });
  useEffect(() => {
    if (rackingInfo !== undefined) {
      const loadSpecificRacking = async () => {
        const url = API_BASE_URL + `fetch-specific-racking-data/` + rackingInfoId;
        axios
          .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })

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
      };
      loadSpecificRacking();
    }
  }, [rackingInfo, rackingInfoId]);

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

  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = rackingInfoId ? API_BASE_URL + "update-specific-racking-data/" + rackingInfoId : API_BASE_URL + "add-racking-data";
    const method = rackingInfoId ? "patch" : "post";
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
            <HeadingFour className="card-title">{rackingInfo ? "Edit" : "Add"} Racking</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="rack_name" label="Rack Name" value={data.rack_name} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField required id="rack_code" label="Rack Code" value={data.rack_code} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField select required name="rack_status" id="rack_status" variant="standard" label="Status" SelectProps={{ value: data.rack_status, onChange: handleFieldChange }}>
                      {rackStatus.map(rackStatus => (
                        <MenuItem key={rackStatus.value} value={rackStatus.value}>
                          {rackStatus.label}
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
export default FormRacking;

FormRacking.propTypes = {
  handleClose: PropTypes.any,
  rackingInfo: PropTypes.any,
};
