import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card } from "react-bootstrap";
import { useParams } from "react-router-dom";
import { IconButton, Tooltip, Drawer, Button } from "@mui/material";
import { MdOutlineModeEditOutline, MdDeleteOutline } from "react-icons/md";
import axios from "axios";
import FormCustomerFeedback from "./form";
import { HeadingTwo, MyDiv, HeadingFour } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerFeedback() {
  let { id } = useParams();
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackDrawerState, setFeedbackDrawerState] = useState(false);

  const loadFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}fetch-customer-feedbacks/${id}`;
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setFeedbacks(res.data);
    } catch (error) {
      console.error("Feedback fetching failed:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  const handleFeedbackDrawerToggle = () => {
    setSelectedFeedback(null);
    setFeedbackDrawerState(!feedbackDrawerState);
  };

  const handleEditFeedback = (feedback) => {
    setSelectedFeedback(feedback);
    setFeedbackDrawerState(true);
  };

  const updateDrawer = () => {
    setFeedbackDrawerState(false);
    loadFeedbacks();
  };

  // Delete feedback function
  const handleDeleteFeedback = async (feedbackId) => {
    swal.fire({
      title: "Are you sure?",
      text: "This feedback will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await axios.delete(`${API_BASE_URL}delete-customer-feedback/${feedbackId}`, {
            headers: {
              "x-access-token": localStorage.getItem("token"),
            },
          });

          // Remove from local state
          setFeedbacks(feedbacks.filter((f) => f._id !== feedbackId));

          swal.fire({
            title: "Deleted!",
            text: "Feedback has been removed.",
            icon: "success",
            timer: 1500,
            showConfirmButton: false,
          });
        } catch (error) {
          console.error("Failed to delete feedback:", error);
          swal.fire("Error", "Something went wrong while deleting.", "error");
        }
      }
    });
  };
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <React.Fragment>
      <Row>
        <Col md={12}>
          <Row className="GeneralHeading mt-3">
            <Col xs={6}>
              <HeadingTwo>Customer Feedback</HeadingTwo>
            </Col>
            <Col xs={6} className="text-end">
              <Button onClick={handleFeedbackDrawerToggle} className="btn primary-btn">
                Add Feedback
              </Button>
            </Col>
          </Row>
          <Row>
            {feedbacks.map((feedback) => (
            <Col md={6}>
              {loading ? (
                <HeadingFour className="text-center">Loading...</HeadingFour>
              ) : feedbacks?.length ? (
                <MyDiv className="feedback-container">
                 
                    <Card key={feedback._id} className="mb-1 my-2">
                      <Card.Body>
                        <MyDiv className="d-flex justify-content-between align-items-start mb-2">
                          <MyDiv>
                            <HeadingFour className="mb-1">
                              {formatDate(feedback.created || feedback.date)}
                            </HeadingFour>
                            <small className="text-muted">
                              {formatTime(feedback.created || feedback.date)}
                            </small>
                          </MyDiv>
                          <MyDiv className="text-end">
                            <Tooltip title="Edit">
                                <IconButton 
                                aria-label="edit" 
                                color="success" 
                                size="small"
                                onClick={() => handleEditFeedback(feedback)}
                                >
                                <MdOutlineModeEditOutline />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                                <IconButton
                                    aria-label="delete"
                                    color="error"
                                    size="small"
                                    onClick={() => handleDeleteFeedback(feedback._id)}
                                >
                                    <MdDeleteOutline />
                                </IconButton>
                            </Tooltip>
                            </MyDiv>
                        </MyDiv>
                        <MyDiv className="feedback-content" style={{ whiteSpace: 'pre-line' }}>
                          {feedback.feedback_text}
                        </MyDiv>
                      </Card.Body>
                    </Card>
                </MyDiv>
              ) : (
                <NoDataFound />
              )}
            </Col>
            ))}
          </Row>
        </Col>
      </Row>
      <Drawer anchor="right" open={feedbackDrawerState} onClose={handleFeedbackDrawerToggle}>
        <FormCustomerFeedback 
          handleClose={updateDrawer} 
          feedbackData={selectedFeedback} 
          customerId={id} 
        />
      </Drawer>
    </React.Fragment>
  );
}

export default CustomerFeedback;