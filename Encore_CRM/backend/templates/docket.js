const deptNames = {
      CL: "CLADDING",
      J: "JOBBING",
      FG: "FASCIA GUTTER",
      DC: "DELIVERY CHARGES",
      ROOF: "ROOFING",
      F: "FLASHING",
      GBI: "GBI",
      GBIL: "GBI.L"
};

const getDeptName = key => deptNames[key?.toUpperCase()] || key;

function docketSummary(items, rackNames){
    const deptSummaryTable = `
        <table cellpadding="2" cellspacing="0" width="100%" style="width:100%; margin-bottom:8px; text-align:left; table-layout: fixed">
            <thead style="background-color:#000;color:#fff;font-size:10px;">
                <tr>
                    ${items
                        .filter(group => group.deptDisplayName !== "DC")
                        .map(group => `
                            <th style="padding:2px 4px; width: 50px;">${group.deptDisplayName}</th>
                        `
                        )
                        .join("")
                    }
                </tr>
            </thead>
            <tbody style="color:#000;font-size:11px;">
                <tr style="font-size:11px;">
                    ${items
                    .filter(group => group.deptDisplayName !== "DC")
                    .map(group => {
                        const deptCode = group.deptDisplayName;
                        const rackName = rackNames[deptCode];
                        const totalPieces = group.totalPieces;
                        const countDisplay = rackName ? `(${rackName}) ${totalPieces} ` : `${totalPieces}`;
                        return `<td style="padding:4px;">${countDisplay}</td>`;
                    })
                    .join("")}
                </tr>
            </tbody>
        </table>`;

    return deptSummaryTable
}

function docketHTMLContent(items, rackNames, serialNumber){
    const orderHtmlContent = `
        <html>
            <head>
                <style>
                @page {
                    margin-right: 50px;margin-left:50px;
                }
                html {-webkit-print-color-adjust: exact;} 
                body { font-family: Arial; font-size: 11px; }
                </style>
            </head>
            <body style="margin:0;padding:0;min-width:100%;">   
                    ${docketSummary(items, rackNames)}
                <table cellpadding="2" cellspacing="0" width="100%" style="width:100%;" >
                    <thead style="background-color:#000;color:#fff;font-size:10px;">
                        <tr>
                            <th style="font-family: Arial, Helvetica, sans-serif;" align="left">NO</th>
                            <th style="font-family: Arial, Helvetica, sans-serif;" align="left">ITEM</th>
                            <th style="font-family: Arial, Helvetica, sans-serif;" align="left">PIECES</th>
                            <th style="font-family: Arial, Helvetica, sans-serif;" align="left">LENGTH</th>
                            <th style="font-family: Arial, Helvetica, sans-serif;" align="left">UOM</th>
                            <th style="font-family: Arial, Helvetica, sans-serif;" align="left">QTY</th>
                        </tr>
                    </thead>
                    <tbody style="color:#000;font-size:11px;">
                        ${items
                        .map(group => `
                            <tr>
                                <td colspan="6" style="font-family: Arial, Helvetica, sans-serif; text-align:center;font-size:14px;border-top:1px solid #333;">
                                    <strong>${getDeptName(group.deptDisplayName)}</strong>
                                </td>
                            </tr>
                            ${group.items
                            .map(item => `
                                <tr style="font-size:11px;">
                                    <td style="font-family: Arial, Helvetica, sans-serif;">${serialNumber++}</td>
                                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.desc}</td>
                                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.pieces}</td>
                                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.length}</td>
                                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.uom}</td>
                                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.qty}</td>   
                                </tr>
                            `
                            )
                            .join("")}
                        `
                        )
                        .join("")}
                    </tbody>
                </table>
            </body>
        </html>`;
    return orderHtmlContent
}

function docketHeader(logoDataUri, order, orderNumber){
    const headerTemplate = `
        <div style="display: flex; flex-direction: column; margin:25px 50px 50px 50px; width: calc(100% - 100px);">
        <div style="display: flex; width: 100%; margin-bottom: 25px;">
            <div style="width: 50%;display:flex;align-items:start;">   
                    <div><img src="${logoDataUri}" alt="ENCORE" style="max-width:100px; margin-right: 10px"></div>
                    <p style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">ENCORE SHEETMETAL<br>67 QUANTUM CLOSE<br>DANDENONG SOUTH, VIC, 3175<br>Phone: 03 9999 7800<br>Web: encoresheetmetal.com.au<br>ABN: 47631765163</p>
            </div>
            <div style="width: 50%; display:flex;justify-content: flex-end">
                <div style="width:230px;display:block;">
                    <h2 style="font-family: Arial, Helvetica, sans-serif; font-size:24px; margin: 0 0 5px 0;text-align:right;width:100%;">Delivery Docket</h2>
                    <table cellpadding="1" cellspacing="0" width="100%" style="font-family: Arial, Helvetica, sans-serif; font-size:12px; width: 100%;">
                        <tr>
                            <td align="left" ><strong style="font-family: Arial, Helvetica, sans-serif;">Order No.:</strong></td>
                            <td align="right" width="50%"><strong style="font-size:13px; font-family: Arial, Helvetica, sans-serif;">${orderNumber || order.order_unique_id}</strong></td>
                        </tr>
                        <tr>
                            <td align="left"><strong style="font-family: Arial, Helvetica, sans-serif;">Order Date:</strong></td>
                            <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                ${order.created_str.split(" ")[0]?.replace(/-/g, "/")}
                            </td>
                        </tr>
                        <tr>
                            <td><strong style="font-family: Arial, Helvetica, sans-serif;">Delivery Date:</strong></td>
                            <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                ${order.order_delivery_date_str.split(" ")[0]?.replace(/-/g, "/")}
                            </td>
                        </tr>
                        <tr><td><strong style="font-family: Arial, Helvetica, sans-serif;">Customer PO:</strong></td>
                            <td align="right" style="font-family: Arial, Helvetica, sans-serif;">${order.order_customer_PO_number}</td></tr>
                        <tr>
                            <td><strong style="font-family: Arial, Helvetica, sans-serif;">Time Required:</strong></td>
                            <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                ${(() => {
                                    let time = order.order_delivery_time;
                                    let session = order.order_delivery_session;
                                    if (time === "12.00 AM") {
                                    return session;
                                    }
                                    time = time?.replace(/^0/, "");
                                    time = time?.replace(/\.00/, "");
                                    time = time?.replace(/\s?(AM|PM)/, "$1");
                                    return `${session}&nbsp;${time}`;
                                })()}
                            </td>
                        </tr>
                        <tr>
                            <td><strong style="font-family: Arial, Helvetica, sans-serif;">Ship Via:</strong></td>
                            <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                ${order.order_delivery_address_mode === "0" ? "Store" : order.order_delivery_address_mode === "1" ? "Site" : order.order_delivery_address_mode === "2" ? "Pick Up" : ""}
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>
        <div style="width:100%;">                     
            <table cellpadding="2" cellspacing="0" width="100%">
            <thead style="background-color:#000;font-size:10px; -webkit-print-color-adjust: exact;font-family: Arial, Helvetica, sans-serif;">
                <tr >
                    <th align="left" style="font-family: Arial, Helvetica, sans-serif; font-size:10px;color:#fff;width:50%;">SHIP TO:</th>
                    <th align="left" style="font-family: Arial, Helvetica, sans-serif; font-size:10px;color:#fff;width:50%;">INFO:</th>
                </tr>
                </thead>
                <tbody>
                    ${
                        order.order_delivery_address_mode === "0"
                        ? `
                    <tr>
                        <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px; vertical-align: top" valign="top">
                            ${order.order_customer_name}<br>
                            -<br>
                            ${order.order_store_delivery_address1}<br>
                            ${order.order_store_delivery_city}&nbsp;${order.order_store_delivery_state}&nbsp;${order.order_store_delivery_postalcode}<br>
                            ${order.order_store_delivery_country}<br>
                            Ph: ${order.order_customer_contact_phone}
                        </td>
                        <td style="font-size:12px;">
                            <strong style="font-family: Arial, Helvetica, sans-serif;">Driver's Info</strong><p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_custom_note ? order.order_custom_note : "-"}</p>
                            <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">Loader's Info</strong> <p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_loaders_info ? order.order_loaders_info : "-"}</p>
                            <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">${order.order_crane_lift_checker ? "CRANE LIFT" : ""}</strong>
                        </td>
                    </tr>
                    `
                        : ""
                    }
                    
                    ${
                        order.order_delivery_address_mode === "1"
                        ? `
                    <tr>
                        <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">
                            ${order.order_customer_name}<br>
                            -<br>
                            ${order.order_site_delivery_address1}<br>
                            ${order.order_site_delivery_city}&nbsp;${order.order_site_delivery_state}&nbsp;${order.order_site_delivery_postalcode}<br>
                            ${order.order_site_delivery_country}<br>
                            Attn: ${order.order_site_delivery_attention_person}<br>
                            Ph: ${order.order_site_delivery_attention_contact}
                        </td>
                        <td style="font-size:12px;">
                            <strong style="font-family: Arial, Helvetica, sans-serif;">Driver's Info</strong><p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_custom_note ? order.order_custom_note : "-"}</p>
                            <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">Loader's Info</strong> <p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_loaders_info ? order.order_loaders_info : "-"}</p>
                            <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">${order.order_crane_lift_checker ? "CRANE LIFT" : ""}</strong>
                        </td>
                    </tr>
                    `
                        : ""
                    }
                    
                    ${
                        order.order_delivery_address_mode === "2"
                        ? `
                    <tr>
                        <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">
                            ${order.order_customer_name}<br>
                            -<br>
                            <strong>PickUp Order</strong>
                            <br>
                            <strong>Attn:</strong> ${order.order_site_delivery_attention_person}<br>
                            <strong>Ph:</strong> ${order.order_site_delivery_attention_contact}
                        </td>
                        <td style="font-size:12px;">
                            <strong style="font-family: Arial, Helvetica, sans-serif;">Driver's Info</strong><p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_custom_note ? order.order_custom_note : "-"}</p>
                            <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">Loader's Info</strong> <p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_loaders_info ? order.order_loaders_info : "-"}</p>
                            <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">${order.order_crane_lift_checker ? "CRANE LIFT" : ""}</strong>
                        </td>
                    </tr>
                    `
                        : ""
                    }
                    
                </tbody>
            </table>             
        </div>
    </div>
    `
    return headerTemplate
}

function docketFooter(){
    const footerTemplate = `
        <div style="font-family: Arial, Helvetica, sans-serif; width:100%;font-size:11px;text-align:right;padding:0 50px;">
            Page 
            <span class="pageNumber"></span> 
                of 
            <span class="totalPages"></span>
        </div>`
    return footerTemplate;
}

module.exports = {
    docketHTMLContent,
    docketSummary,
    docketHeader,
    docketFooter
}