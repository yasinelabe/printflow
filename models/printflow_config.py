# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1

from odoo import api, fields, models
import logging
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
_logger = logging.getLogger(__name__)


class PrintFlowSettings(models.TransientModel):
    """Configuration settings for PrintFlow printing system."""
    _inherit = 'res.config.settings'

    printflow_server_url = fields.Char(
        string="PrintFlow Server Address",
        help="The network address where PrintFlow Desktop Agent is running. "
             "Format: https://IP_ADDRESS:PORT (e.g., https://192.168.1.100:5000)",
        config_parameter='printflow.server_url',
    )

    printflow_active = fields.Boolean(
        string="Enable PrintFlow",
        help="Activate direct printing functionality across the system",
        config_parameter='printflow.active',
        default=True,
    )

    printflow_log_retention = fields.Integer(
        string="Log Retention (days)",
        help="Number of days to keep print history logs. Set to 0 to keep forever.",
        config_parameter='printflow.log_retention_days',
        default=30,
    )

    def action_verify_connection(self):
        """Test connectivity to the PrintFlow desktop agent."""
        server_url = self.printflow_server_url
        if not server_url:
            server_url = self.env['ir.config_parameter'].sudo().get_param(
                'printflow.server_url', 'https://localhost:5000'
            )
        
        try:
            endpoint = f"{server_url.rstrip('/')}/status"
            response = requests.get(endpoint, timeout=5, verify=False)
            
            if response.status_code == 200:
                result = response.json()
                printer_list = result.get('printers', [])
                printer_count = len(printer_list)
                
                return self._show_notification(
                    "Connection Successful",
                    f"PrintFlow agent is online. Detected {printer_count} printer(s): {', '.join(printer_list[:3])}{'...' if printer_count > 3 else ''}",
                    "success"
                )
            else:
                return self._show_notification(
                    "Connection Issue",
                    f"Agent responded with status {response.status_code}",
                    "warning"
                )
                
        except requests.exceptions.Timeout:
            return self._show_notification(
                "Connection Timeout",
                "The agent did not respond within 5 seconds. Verify the address and ensure the agent is running.",
                "danger"
            )
        except requests.exceptions.ConnectionError:
            return self._show_notification(
                "Connection Failed",
                "Unable to reach the PrintFlow agent. Check the server address and network connectivity.",
                "danger"
            )
        except Exception as error:
            _logger.exception("PrintFlow connection test failed")
            return self._show_notification(
                "Unexpected Error",
                str(error),
                "danger"
            )

    def _show_notification(self, title, message, notification_type):
        """Display a notification to the user."""
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': title,
                'message': message,
                'type': notification_type,
                'sticky': notification_type == 'danger',
            }
        }

    def action_open_report_configuration(self):
        """Navigate to report printer assignment view."""
        return {
            'type': 'ir.actions.act_window',
            'name': 'Report Printer Configuration',
            'res_model': 'ir.actions.report',
            'view_mode': 'list,form',
            'domain': [('report_type', 'in', ['qweb-pdf', 'qweb-html'])],
            'context': {'search_default_has_printer': False},
            'target': 'current',
        }

    def action_view_print_history(self):
        """Navigate to print history view."""
        return {
            'type': 'ir.actions.act_window',
            'name': 'Print History',
            'res_model': 'printflow.history',
            'view_mode': 'list,form',
            'context': {'search_default_today': True},
            'target': 'current',
        }

    @api.model
    def get_printflow_server(self):
        """Retrieve the configured PrintFlow server URL."""
        return self.env['ir.config_parameter'].sudo().get_param(
            'printflow.server_url', 'https://localhost:5000'
        )
