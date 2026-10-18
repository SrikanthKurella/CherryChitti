import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:uuid/uuid.dart';

import 'models.dart';

class ChitRepository {
  ChitRepository({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _db = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _db;
  final FirebaseAuth _auth;
  static const _uuid = Uuid();

  String get _uid {
    final uid = _auth.currentUser?.uid;
    if (uid == null) throw StateError('Please sign in to access business data.');
    return uid;
  }

  CollectionReference<Map<String, dynamic>> get _members =>
      _db.collection('businesses').doc(_uid).collection('members');

  CollectionReference<Map<String, dynamic>> get _payments =>
      _db.collection('businesses').doc(_uid).collection('payments');

  Stream<List<ChitMember>> watchMembers() => _members
      .orderBy('name')
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((doc) => ChitMember.fromMap(doc.id, doc.data()))
          .toList());

  Stream<List<ChitPayment>> watchPayments() => _payments
      .orderBy('paymentDate', descending: true)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((doc) => ChitPayment.fromMap(doc.id, doc.data()))
          .toList());

  Future<void> saveMember(ChitMember member) async {
    final doc = member.id.isEmpty ? _members.doc() : _members.doc(member.id);
    final now = FieldValue.serverTimestamp();
    await doc.set({
      ...member.toMap(),
      if (member.id.isEmpty) 'createdAt': now,
      'updatedAt': now,
    }, SetOptions(merge: true));
  }

  Future<void> recordPayment({
    required ChitMember member,
    required DateTime paymentDate,
    required String installmentMonth,
    required int receivedPaise,
    required PaymentMode mode,
    required String reference,
    required String note,
  }) async {
    if (receivedPaise <= 0) throw ArgumentError('Amount received must be greater than zero.');
    final monthParts = installmentMonth.split('-');
    final year = monthParts.length == 2 ? int.tryParse(monthParts[0]) : null;
    final month = monthParts.length == 2 ? int.tryParse(monthParts[1]) : null;
    if (year == null ||
        month == null ||
        month < 1 ||
        month > 12 ||
        !isScheduled(member, DateTime(year, month))) {
      throw ArgumentError('Installment month must fall within the member schedule.');
    }
    final paymentRef = _payments.doc(_uuid.v4());
    final installmentRef = _members
        .doc(member.id)
        .collection('installments')
        .doc(installmentMonth);
    final memberRef = _members.doc(member.id);

    await _db.runTransaction((transaction) async {
      final installmentSnapshot = await transaction.get(installmentRef);
      final previousReceived =
          installmentSnapshot.data()?['receivedPaise'] as int? ?? 0;
      final duePaise = installmentSnapshot.data()?['duePaise'] as int? ??
          member.installmentPaise;
      final newTotal = previousReceived + receivedPaise;
      if (newTotal > duePaise) {
        throw StateError('Received amount exceeds the remaining installment balance.');
      }
      final status = newTotal == duePaise
          ? PaymentStatus.paid
          : PaymentStatus.partial;
      final receipt = 'RC-${DateTime.now().year}-${paymentRef.id.toUpperCase()}';
      transaction.set(paymentRef, {
        'memberId': member.id,
        'memberName': member.name,
        'group': member.group,
        'paymentDate': Timestamp.fromDate(paymentDate),
        'installmentMonth': installmentMonth,
        'duePaise': duePaise,
        'receivedPaise': receivedPaise,
        'mode': mode.name,
        'status': status.name,
        'receiptNumber': receipt,
        'reference': reference.trim(),
        'note': note.trim(),
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      transaction.set(installmentRef, {
        'duePaise': duePaise,
        'receivedPaise': newTotal,
        'status': status.name,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      transaction.set(memberRef, {'updatedAt': FieldValue.serverTimestamp()},
          SetOptions(merge: true));
    });
  }

  bool isScheduled(ChitMember member, DateTime month) {
    final selected = DateTime(month.year, month.month);
    final start = DateTime(member.startDate.year, member.startDate.month);
    final end =
        DateTime(member.startDate.year, member.startDate.month + member.durationMonths);
    return !selected.isBefore(start) && selected.isBefore(end);
  }
}
