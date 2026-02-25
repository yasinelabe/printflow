# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1

from odoo import api, fields, models


class PrintFlowHistory(models.Model):
    """Log of all print jobs processed through PrintFlow."""
    _name = 'printflow.history'
    _description = 'PrintFlow Print History'
    _order = 'timestamp desc'
    _rec_name = 'display_name'

    timestamp = fields.Datetime(
        string="Time",
        default=fields.Datetime.now,
        required=True,
        index=True,
    )

    target_printer = fields.Char(
        string="Printer",
        required=True,
        index=True,
    )

    document_model = fields.Char(
        string="Document Type",
    )

    document_name = fields.Char(
        string="Document",
    )

    output_format = fields.Selection(
        selection=[
            ('graphic', 'Graphic'),
            ('graphic_cut', 'Graphic + Cut'),
            ('raw', 'Raw/Text'),
            ('pdf', 'PDF'),
        ],
        string="Format",
    )

    result_status = fields.Selection(
        selection=[
            ('queued', 'Queued'),
            ('delivered', 'Delivered'),
            ('error', 'Error'),
        ],
        string="Status",
        default='queued',
        index=True,
    )

    error_details = fields.Text(
        string="Error Details",
    )

    payload_bytes = fields.Integer(
        string="Size (bytes)",
    )

    initiated_by = fields.Many2one(
        'res.users',
        string="User",
        default=lambda self: self.env.user,
        index=True,
    )

    source_terminal = fields.Many2one(
        'pos.config',
        string="POS Terminal",
    )

    display_name = fields.Char(
        string="Description",
        compute='_compute_display_name',
        store=True,
    )

    @api.depends('target_printer', 'document_name', 'timestamp')
    def _compute_display_name(self):
        for record in self:
            doc_part = record.document_name or record.document_model or 'Document'
            record.display_name = f"{doc_part} → {record.target_printer}"

    @api.model
    def log_print_job(self, printer, doc_model=None, doc_name=None, 
                      output_format=None, status='queued', size=0, 
                      error=None, pos_config=None):
        """Create a new print history entry."""
        return self.sudo().create({
            'target_printer': printer,
            'document_model': doc_model,
            'document_name': doc_name,
            'output_format': output_format,
            'result_status': status,
            'payload_bytes': size,
            'error_details': error,
            'source_terminal': pos_config,
        })

    @api.autovacuum
    def _cleanup_old_records(self):
        """Automatically remove old print history based on retention setting."""
        retention_days = int(self.env['ir.config_parameter'].sudo().get_param(
            'printflow.log_retention_days', '30'
        ))
        
        if retention_days > 0:
            cutoff_date = fields.Datetime.subtract(
                fields.Datetime.now(), 
                days=retention_days
            )
            old_records = self.sudo().search([
                ('timestamp', '<', cutoff_date)
            ])
            old_records.unlink()
