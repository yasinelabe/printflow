/** @odoo-module */
/*
 * PrintFlow Settings - Browser-based Connection Verification
 * Copyright 2024 Yasin Elabe
 * License OPL-1
 */

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useState } from "@odoo/owl";

/**
 * Verify connection to PrintFlow agent from the browser
 */
async function verifyPrintFlowConnection(serverUrl) {
    if (!serverUrl) {
        serverUrl = 'https://localhost:5000';
    }
    
    const endpoint = `${serverUrl.replace(/\/$/, '')}/status`;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(endpoint, {
            method: 'GET',
            signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return {
                success: false,
                error: `Agent responded with status ${response.status}`,
            };
        }
        
        const data = await response.json();
        return {
            success: true,
            data: data,
            printers: data.printers || [],
            version: data.version || 'Unknown',
        };
        
    } catch (error) {
        if (error.name === 'AbortError') {
            return {
                success: false,
                error: 'Connection timed out after 5 seconds. Make sure the agent is running.',
            };
        }
        
        // Check for common connection errors
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            return {
                success: false,
                error: 'Unable to connect. Check the URL and ensure the agent is running. Note: You may need to accept the SSL certificate first by visiting the agent URL directly in your browser.',
            };
        }
        
        return {
            success: false,
            error: error.message || 'Connection failed',
        };
    }
}

/**
 * Client action to verify PrintFlow connection
 * Must not return anything to avoid ActionManager errors
 */
function actionVerifyConnection(env, action) {
    const notification = env.services.notification;
    const serverUrl = action.params?.server_url || 'https://localhost:5000';
    
    notification.add('Testing connection to PrintFlow agent...', {
        type: 'info',
        sticky: false,
    });
    
    // Run verification asynchronously without returning the promise
    verifyPrintFlowConnection(serverUrl).then(result => {
        if (result.success) {
            const printerCount = result.printers.length;
            const printerList = result.printers.slice(0, 3).join(', ');
            const suffix = printerCount > 3 ? '...' : '';
            
            notification.add(
                `Connected! Found ${printerCount} printer(s): ${printerList}${suffix}`,
                {
                    type: 'success',
                    title: 'PrintFlow Agent Online',
                    sticky: false,
                }
            );
        } else {
            notification.add(
                result.error,
                {
                    type: 'danger',
                    title: 'Connection Failed',
                    sticky: true,
                }
            );
        }
    });
    
    // Return undefined to signal no further action needed
    return;
}

// Register the client action
registry.category("actions").add("printflow_verify_connection", actionVerifyConnection);

// Export for use in other modules
export { verifyPrintFlowConnection };
