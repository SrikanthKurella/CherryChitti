import 'package:cloud_firestore/cloud_firestore.dart';

enum PaymentStatus { paid, partial, pending }
enum PaymentMode { online, cash, cheque }

DateTime dateFrom(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  throw FormatException('Expected a Firestore timestamp, got $value.');
}

String _stringValue(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is String) return value;
  throw FormatException('Invalid or missing "$key" value.');
}

int _intValue(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is int) return value;
  throw FormatException('Invalid or missing "$key" value.');
}

class ChitMember {
  const ChitMember({
    required this.id,
    required this.name,
    required this.phone,
    required this.group,
    required this.installmentPaise,
    required this.startDate,
    required this.durationMonths,
    required this.dueDay,
    required this.active,
    this.address = '',
  });

  final String id;
  final String name;
  final String phone;
  final String group;
  final int installmentPaise;
  final DateTime startDate;
  final int durationMonths;
  final int dueDay;
  final bool active;
  final String address;

  int get scheduledPaise => installmentPaise * durationMonths;

  factory ChitMember.fromMap(String id, Map<String, dynamic> data) =>
      ChitMember(
        id: id,
        name: _stringValue(data, 'name'),
        phone: _stringValue(data, 'phone'),
        group: _stringValue(data, 'group'),
        installmentPaise: _intValue(data, 'installmentPaise'),
        startDate: dateFrom(data['startDate']),
        durationMonths: _intValue(data, 'durationMonths'),
        dueDay: _intValue(data, 'dueDay'),
        active: data['active'] as bool,
        address: data['address'] as String? ?? '',
      );

  Map<String, dynamic> toMap() => {
        'name': name.trim(),
        'phone': phone.trim(),
        'group': group.trim(),
        'installmentPaise': installmentPaise,
        'startDate': Timestamp.fromDate(startDate),
        'durationMonths': durationMonths,
        'dueDay': dueDay,
        'active': active,
        'address': address.trim(),
      };
}

class ChitPayment {
  const ChitPayment({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.group,
    required this.paymentDate,
    required this.installmentMonth,
    required this.duePaise,
    required this.receivedPaise,
    required this.mode,
    required this.status,
    required this.receiptNumber,
    this.reference = '',
    this.note = '',
  });

  final String id;
  final String memberId;
  final String memberName;
  final String group;
  final DateTime paymentDate;
  final String installmentMonth;
  final int duePaise;
  final int receivedPaise;
  final PaymentMode mode;
  final PaymentStatus status;
  final String receiptNumber;
  final String reference;
  final String note;

  factory ChitPayment.fromMap(String id, Map<String, dynamic> data) =>
      ChitPayment(
        id: id,
        memberId: _stringValue(data, 'memberId'),
        memberName: _stringValue(data, 'memberName'),
        group: _stringValue(data, 'group'),
        paymentDate: dateFrom(data['paymentDate']),
        installmentMonth: _stringValue(data, 'installmentMonth'),
        duePaise: _intValue(data, 'duePaise'),
        receivedPaise: _intValue(data, 'receivedPaise'),
        mode: PaymentMode.values.firstWhere(
          (item) => item.name == _stringValue(data, 'mode'),
        ),
        status: PaymentStatus.values.firstWhere(
          (item) => item.name == _stringValue(data, 'status'),
        ),
        receiptNumber: _stringValue(data, 'receiptNumber'),
        reference: data['reference'] as String? ?? '',
        note: data['note'] as String? ?? '',
      );
}
