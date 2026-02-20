import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv } from "../../Common/Components";
import { MdKeyboardArrowLeft, MdDownload } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip } from "@mui/material";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function LogsManage() {
  let navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}logs-list`, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setLogs(response.data.logs || []);
    } catch (error) {
      swal.fire({
        text: error?.response?.data || "Error fetching logs.",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const extractDateFromFilename = filename => {
    const match = filename.match(/^(\d{2})(\d{2})(\d{4})/);
    if (!match) return "Unknown Date";
    const [, day, month, year] = match;
    return `${day}-${month}-${year}`;
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage Logs
          </HeadingTwo>
        </Col>
      </Row>

      <Row>
        <Col>
          <MyDiv className="GeneralTable">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey" aria-label="logs table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Log File</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.length > 0 ? (
                      logs.map((filename, index) => (
                        <TableRow key={index}>
                          <TableCell align="left">{extractDateFromFilename(filename)}</TableCell>
                          <TableCell align="center">
                            <Box className="custom-flex">
                              <Tooltip title="Open Log">
                                <IconButton component="a" href={`${API_BASE_URL}logs/${filename}`} target="_blank" rel="noopener noreferrer" color="primary">
                                  <MdDownload />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2}>
                          <NoDataFound />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
        </Col>
      </Row>
    </React.Fragment>
  );
}

export default LogsManage;
