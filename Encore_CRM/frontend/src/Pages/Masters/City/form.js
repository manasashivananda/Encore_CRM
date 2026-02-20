import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem, FormControlLabel, Switch, Autocomplete } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cityStatus, rackList, stateList } from "../../Common/staticjson";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormCity({ handleClose, cityInfo }) {
  let cityInfoId = cityInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    city_Name: "",
    city_Pincode: "",
    city_FarSuburb: false,
    city_Rack: "",
    city_State: "VIC",
    city_Country: "AU",
    city_Status: "active",
  });

  useEffect(() => {
    if (cityInfo !== undefined) {
      const loadSpecificCity = async () => {
        const url = API_BASE_URL + `fetch-specific-city-data/` + cityInfoId;
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
      loadSpecificCity();
    }
  }, [cityInfo, cityInfoId]);

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
    const url = cityInfoId ? API_BASE_URL + "update-specific-city-data/" + cityInfoId : API_BASE_URL + "add-new-city-data";
    const method = cityInfoId ? "patch" : "post";
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
            <HeadingFour className="card-title">{cityInfo ? "Edit" : "Add"} City</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="city_Name" label="City Name" value={data.city_Name} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField type="number" required id="city_Pincode" label="PinCode" value={data.city_Pincode} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <Autocomplete
                      disablePortal
                      options={rackList.map(rack => rack.value)}
                      value={data.city_Rack}
                      onChange={(event, newValue) => {
                        setData(prevData => ({ ...prevData, city_Rack: newValue }));
                      }}
                      renderInput={params => <TextField {...params} label="Master Rack Number" required variant="standard" />}
                    />
                  </Col>
                  <Col md={12}>
                    <FormControlLabel
                      label="Far Suburb"
                      labelPlacement="start"
                      className="mx-0"
                      name="city_FarSuburb"
                      control={<Switch checked={data.city_FarSuburb} onChange={handleFieldChange} />}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField select required name="city_State" id="city_State" variant="standard" label="Site State" SelectProps={{ value: data.city_State, onChange: handleFieldChange }}>
                      {stateList.map(stateList => (
                        <MenuItem key={stateList.value} value={stateList.value}>
                          {stateList.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12}>
                    <TextField required id="city_Country" label="Country" value={data.city_Country} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField select required name="city_Status" id="city_status" variant="standard" label="Status" SelectProps={{ value: data.city_Status, onChange: handleFieldChange }}>
                      {cityStatus.map(cityStatus => (
                        <MenuItem key={cityStatus.value} value={cityStatus.value}>
                          {cityStatus.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <span aria-live="polite" className="d-inline-flex align-items-center">
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          <span className="visually-hidden">Loading...</span>
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
export default FormCity;

FormCity.propTypes = {
  handleClose: PropTypes.any,
  cityInfo: PropTypes.any,
};
