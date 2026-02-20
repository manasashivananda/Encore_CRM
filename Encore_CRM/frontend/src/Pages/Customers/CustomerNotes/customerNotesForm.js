import React, { useState } from "react";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { HeadingFour, MyDiv } from "../../Common/Components";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormCustomerNotes({ handleClose, noteData, customerId }) {
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState(
    noteData || {
      notes: "",
    }
  );

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    // Restrict to 200 characters max
    if (value.length <= 50) {
      setData((data) => ({
        ...data,
        [name]: value,
      }));
    }
  };

  const countCharacters = (text) => text.length;

  function submit(e) {
    e.preventDefault();

    // Validate notes character count
    const charCount = countCharacters(data.notes);
    if (charCount > 50) {
      swal.fire({
        text: `Notes must not exceed 200 characters. Current count: ${charCount}.`,
        icon: "warning",
      });
      return;
    }

    setBtnLoading(true);
    const url = noteData
      ? `${API_BASE_URL}update-specific-customer-note/${noteData._id}`
      : `${API_BASE_URL}add-customer-note/${customerId}`;
    const method = noteData ? "patch" : "post";

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
      .then((res) => {
        if (res.status === 200) {
          swal.fire({
            text: res.data || "Successfully Saved",
            icon: "success",
          });
          handleClose();
          setBtnLoading(false);
        }
      })
      .catch((error) => {
        setBtnLoading(false);
        swal.fire({
          text: error.response?.data || "Something went wrong",
          icon: "error",
        });
      });
  }

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">
              {noteData ? "Edit" : "Add"} Customer Note
            </HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={submit}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField
                      required
                      fullWidth
                      multiline
                      rows={3}
                      id="notes"
                      name="notes"
                      label="Notes"
                      value={data.notes}
                      variant="standard"
                      onChange={handleFieldChange}
                      helperText={`Character count: ${countCharacters(
                        data.notes
                      )}/50`}
                    />
                  </Col>
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button
                        variant="primary"
                        disabled
                        className="mt-4 w-100"
                      >
                        <span
                          aria-live="polite"
                          className="d-inline-flex align-items-center"
                        >
                          <Spinner
                            as="span"
                            animation="border"
                            size="sm"
                            aria-hidden="true"
                            className="mx-2"
                          />
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

FormCustomerNotes.propTypes = {
  handleClose: PropTypes.func.isRequired,
  noteData: PropTypes.object,
  customerId: PropTypes.any.isRequired,
};

export default FormCustomerNotes;
