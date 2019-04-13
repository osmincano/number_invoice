# -*- coding: utf-8 -*-
from openerp import fields, models


class pos_config(models.Model):
    _inherit = "pos.config"

    pos_auto_invoice = fields.Boolean('POS auto invoice',
                                      help='POS auto to checked to invoice button',
                                      default=1)
    receipt_invoice_number = fields.Boolean('Receipt show invoice number', default=1)
    receipt_customer_vat = fields.Boolean('Receipt show customer VAT', default=1)