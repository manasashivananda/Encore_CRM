import React, { useState, useEffect } from "react";
import { HeadingFour, LabelTag, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner } from "react-bootstrap";
import { Button } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { Form, Field } from "react-final-form";
import arrayMutators from "final-form-arrays";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


export default function FormRolePermission({ handleClose, roleAddPermissions }) {
  const [modules, setModules] = useState([]);
  const [values, setPosts] = useState({});
  const [PerPermission, setPermission] = useState({});
  const [btnLoading, setBtnLoading] = useState(false);

  useEffect(() => {
    loadModules();
  }, []);
  useEffect(() => {
    if (!roleAddPermissions) return;

    const loadPermissions = async () => {
      const url = API_BASE_URL + `fetch-role-permission-data/` + roleAddPermissions;
      axios
        .get(url, {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        })
        .then(res => {
          setPosts(res.data);
          setPermission(res.data);
        })
        .catch(error => {
          swal.fire({
            text: error.response?.data || "Something went wrong",
            icon: "error",
            type: "error",
          });
        });
    };

    loadPermissions();
  }, [roleAddPermissions]);

  const loadModules = async () => {
    const url = API_BASE_URL + `fetch-modules-data`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setModules(res.data);
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

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const perValues = PerPermission;
  const onSubmit = async values => {
    setBtnLoading(true);
    var newPermission;
    if (Object.keys(perValues).length === 0) {
      newPermission = 0;
    } else {
      newPermission = 1;
    }
    await sleep(300);
    const url = newPermission === 1 ? API_BASE_URL + "update-role-permissions/" + roleAddPermissions : API_BASE_URL + "add-role-permissions-data/" + roleAddPermissions;
    const method = newPermission === 1 ? "patch" : "post";
    var data = values;
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
  };

  return (
    <div className="DrawerRight rolePermissionDrawer">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">Role Permissions</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <Form
                onSubmit={onSubmit}
                mutators={{ ...arrayMutators }}
                initialValues={values}
                render={({ handleSubmit, form, submitting, pristine, values }) => (
                  <form onSubmit={handleSubmit}>
                    {modules.map((item, itemIndex) => {
                      return (
                        <Row key={itemIndex} className="roleRow">
                          <Col md={5}>
                            <LabelTag className="fw-bold">{item.modules_Name}</LabelTag>
                          </Col>
                          <Col md={7}>
                            <Row>
                              <Col xs={4}>
                                <label>
                                  <Field name={item._id} component="input" type="checkbox" value="add" /> Add
                                </label>
                              </Col>
                              <Col xs={4}>
                                <label>
                                  <Field name={item._id} component="input" type="checkbox" value="edit" /> Edit
                                </label>
                              </Col>
                              <Col xs={4}>
                                <label>
                                  <Field name={item._id} component="input" type="checkbox" value="view" /> View
                                </label>
                              </Col>
                            </Row>
                          </Col>
                        </Row>
                      );
                    })}

                    <Row className="buttons my-4">
                      <Col className="text-end">
                        <Button className="btn primary-btn" type="submit" disabled={btnLoading || submitting || pristine}>
                          {btnLoading ? <Spinner animation="border" size="sm" /> : "Submit"}
                        </Button>
                        <button className="btn secondary-btn ms-2" type="button" onClick={form.reset} disabled={submitting || pristine}>
                          Reset
                        </button>
                      </Col>
                    </Row>
                  </form>
                )}
              />
            </MyDiv>
          </Card.Body>
        </Card>
      </MyDiv>
    </div>
  );
}
