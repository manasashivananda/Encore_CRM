import React from "react";
import { Row, Col } from "react-bootstrap";
import FoldsManage from "./manageFold";
import GirthManage from "./manageGrith";

function GirthFoldsManage() {
  return (
    <React.Fragment>
      <Row className="mt-3">
        <Col md={6}>
          <GirthManage />
        </Col>
        <Col md={6}>
          <FoldsManage />
        </Col>
      </Row>
    </React.Fragment>
  );
}

export default GirthFoldsManage;
