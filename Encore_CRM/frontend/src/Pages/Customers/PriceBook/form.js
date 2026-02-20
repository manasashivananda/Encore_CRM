import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { useParams } from "react-router-dom";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import axios from "axios";
import swal from "sweetalert2";
import { Form, Field } from "react-final-form";
import arrayMutators from "final-form-arrays";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


export default function FormPriceBook({ handleClose, customerInfo }) {
  let { id } = useParams();
  const [speMetPrice, setCusSpeMatPrice] = useState([]);
  const [loading, setLoading] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const loadCustomerSpecificMaterialPrice = useCallback(async () => {
    if (!customerInfo?.id) return;
    setLoading(true);
    const url = `${API_BASE_URL}fetch-customer-specific-material-specific-pricebook/${id}/${customerInfo.id}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setCusSpeMatPrice(res.data);
      setDataLoaded(true);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Something went wrong",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id, customerInfo?.id]);

  useEffect(() => {
    if (customerInfo?.id && !dataLoaded) {
      loadCustomerSpecificMaterialPrice();
    }
  }, [dataLoaded, customerInfo?.id, loadCustomerSpecificMaterialPrice]);

  const onSubmit = async values => {
    setBtnLoading(true);
    const url = `${API_BASE_URL}add-customer-specific-material-pricebook/${id}/${customerInfo.id}`;
    const method = "post";
    const data = values;
    try {
      const res = await axios({ method, url, data, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (res.status === 200) {
        swal.fire({
          text: "Successfully Saved",
          icon: "success",
          type: "success",
        });
        handleClose();
        setBtnLoading(false);
      }
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
      setBtnLoading(false);
    }
  };

  return (
    <div className="DrawerRight priceBookDrawer">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{customerInfo ? customerInfo.name : ""} - Price Book</HeadingFour>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <HeadingFour className="text-center">Generating price matrix based on Customer. Please wait...</HeadingFour>
            ) : (
              <MyDiv className="DrawerForm">
                <Row className="PriceBookHeader">
                  {Array.isArray(speMetPrice?.headers) && speMetPrice.headers.map((HeaderItem, index) => <Col key={HeaderItem?.id || index}>{HeaderItem?.value}</Col>)}
                </Row>
                <Form
                  onSubmit={onSubmit}
                  mutators={{ ...arrayMutators }}
                  initialValues={{}}
                  render={({ handleSubmit, form, submitting, pristine, values }) => (
                    <form onSubmit={handleSubmit}>
                      {Array.isArray(speMetPrice?.rowvalues) &&
                        speMetPrice.rowvalues.map((RowItem, index) => (
                          <Row key={index} className="PriceBookRow">
                            {RowItem?.length
                              ? RowItem.map((itemInner, index) => <React.Fragment key={index}>{index === 0 ? <Col className="Grith">{itemInner.value}</Col> : null}</React.Fragment>)
                              : null}

                            {RowItem?.length
                              ? RowItem.map((itemInner, index) => (
                                  <React.Fragment key={index}>
                                    {index !== 0 ? (
                                      <Col>
                                        <Field name={itemInner.girthId + "-" + itemInner.foldId} component="input" min="0" step=".01" type="number" defaultValue={itemInner.value} />
                                      </Col>
                                    ) : null}
                                  </React.Fragment>
                                ))
                              : null}
                          </Row>
                        ))}

                      <Row className="buttons my-4">
                        <Col className="text-end">
                          {btnLoading ? (
                            <Button variant="primary" disabled className="mt-4">
                              <span aria-live="polite" className="d-inline-flex align-items-center">
                                <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                                <span className="visually-hidden">Loading...</span>
                              </span>
                            </Button>
                          ) : (
                            <>
                              <button type="submit" disabled={submitting || pristine} className="btn primary-btn add-cta ">
                                Submit
                              </button>
                              <button className="btn secondary-btn ms-2" type="button" onClick={form.reset} disabled={submitting || pristine}>
                                Reset
                              </button>
                            </>
                          )}
                        </Col>
                      </Row>
                    </form>
                  )}
                />
              </MyDiv>
            )}
          </Card.Body>
        </Card>
      </MyDiv>
    </div>
  );
}
