import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'models.dart';
import 'repository.dart';

final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _date = DateFormat('dd-MM-yyyy');
final _month = DateFormat('yyyy-MM');
final _repository = ChitRepository();

String money(int paise) => _money.format(paise / 100);
String rupeesInput(int paise) =>
    '${paise ~/ 100}.${(paise % 100).toString().padLeft(2, '0')}';

int? paiseFromInput(String value) {
  final match = RegExp(r'^\s*(\d+)(?:\.(\d{1,2}))?\s*$').firstMatch(value);
  if (match == null) return null;
  final rupees = int.tryParse(match.group(1)!);
  final fraction = int.tryParse((match.group(2) ?? '').padRight(2, '0'));
  if (rupees == null || fraction == null) return null;
  return rupees * 100 + fraction;
}

bool scheduledInMonth(ChitMember member, DateTime month) {
  final firstMonth = DateTime(month.year, month.month);
  final startMonth = DateTime(member.startDate.year, member.startDate.month);
  final endMonth =
      DateTime(member.startDate.year, member.startDate.month + member.durationMonths);
  return !firstMonth.isBefore(startMonth) && firstMonth.isBefore(endMonth);
}

String errorText(Object error) => error is FirebaseException
    ? error.message ?? 'A service error occurred.'
    : error.toString().replaceFirst('Bad state: ', '');

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _working = false;
  bool _registering = false;

  Future<void> _submit() async {
    setState(() => _working = true);
    try {
      if (_registering) {
        await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on FirebaseAuthException catch (error) {
      if (mounted) _message(error.message ?? 'Unable to sign in.');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _message(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _resetPassword() async {
    if (_email.text.trim().isEmpty) {
      _message('Enter your email address first.');
      return;
    }
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: _email.text.trim());
      if (mounted) _message('Password reset email sent.');
    } on FirebaseAuthException catch (error) {
      if (mounted) _message(error.message ?? 'Could not send reset email.');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                elevation: 0,
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Icon(Icons.account_balance_wallet_outlined,
                          size: 48, color: Color(0xFF176B5B)),
                      const SizedBox(height: 12),
                      Text(_registering ? 'Create your business account' : 'Welcome back',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 8),
                      const Text('Secure access to your chit fund records',
                          textAlign: TextAlign.center),
                      const SizedBox(height: 24),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          prefixIcon: Icon(Icons.mail_outline),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                      ),
                      if (!_registering)
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: _resetPassword,
                            child: const Text('Forgot password?'),
                          ),
                        ),
                      const SizedBox(height: 8),
                      FilledButton(
                        onPressed: _working ? null : _submit,
                        child: Text(_working
                            ? 'Please wait…'
                            : _registering
                                ? 'Create account'
                                : 'Sign in'),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _registering = !_registering),
                        child: Text(_registering
                            ? 'Already registered? Sign in'
                            : 'New here? Create an account'),
                      ),
                      if (!_registering)
                        TextButton.icon(
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) => const PhoneSignInScreen(),
                            ),
                          ),
                          icon: const Icon(Icons.phone_android),
                          label: const Text('Sign in with phone OTP'),
                        ),
                      const Text(
                        'Enable Email/Password and Phone providers in Firebase Authentication.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class PhoneSignInScreen extends StatefulWidget {
  const PhoneSignInScreen({super.key});

  @override
  State<PhoneSignInScreen> createState() => _PhoneSignInScreenState();
}

class _PhoneSignInScreenState extends State<PhoneSignInScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  String? _verificationId;
  bool _working = false;

  Future<void> _sendCode() async {
    final number = _phone.text.trim();
    if (!number.startsWith('+') || number.length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter the phone number in international format, e.g. +91…')),
      );
      return;
    }
    setState(() => _working = true);
    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: number,
        verificationCompleted: (credential) async {
          await FirebaseAuth.instance.signInWithCredential(credential);
          if (mounted) Navigator.pop(context);
        },
        verificationFailed: (error) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error.message ?? 'Phone verification failed.')),
            );
          }
        },
        codeSent: (verificationId, _) {
          if (mounted) setState(() => _verificationId = verificationId);
        },
        codeAutoRetrievalTimeout: (verificationId) {
          _verificationId = verificationId;
        },
      );
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'Could not send verification code.')),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _verifyCode() async {
    if (_verificationId == null || _code.text.trim().isEmpty) return;
    setState(() => _working = true);
    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: _verificationId!,
        smsCode: _code.text.trim(),
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
      if (mounted) Navigator.pop(context);
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'Invalid verification code.')),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Phone sign-in')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone number (+91…)'),
            ),
            const SizedBox(height: 12),
            if (_verificationId != null)
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'SMS verification code'),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _working ? null : _verificationId == null ? _sendCode : _verifyCode,
              child: Text(_working
                  ? 'Please wait…'
                  : _verificationId == null
                      ? 'Send verification code'
                      : 'Verify and sign in'),
            ),
          ],
        ),
      );
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _selected = 0;
  final _titles = const ['Overview', 'Members', 'Transactions', 'Upcoming', 'Reports'];

  @override
  Widget build(BuildContext context) {
    final pages = const [
      DashboardScreen(),
      MembersScreen(),
      TransactionsScreen(),
      UpcomingScreen(),
      ReportsScreen(),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_selected], style: const TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => FirebaseAuth.instance.signOut(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(child: pages[_selected]),
      floatingActionButton: _selected == 0
          ? FloatingActionButton.extended(
              onPressed: () => _openPayment(context),
              icon: const Icon(Icons.add_card),
              label: const Text('Add payment'),
            )
          : null,
      persistentFooterButtons: _selected == 1
          ? [
              FilledButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(builder: (_) => const MemberFormScreen()),
                ),
                icon: const Icon(Icons.person_add_alt),
                label: const Text('Add member'),
              ),
              FilledButton.tonalIcon(
                onPressed: () => _openPayment(context),
                icon: const Icon(Icons.add_card),
                label: const Text('Add payment'),
              ),
            ]
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selected,
        onDestinationSelected: (index) => setState(() => _selected = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.space_dashboard_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.people_outline), label: 'Members'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'History'),
          NavigationDestination(icon: Icon(Icons.event_note_outlined), label: 'Upcoming'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
        ],
      ),
    );
  }
}

void _openPayment(BuildContext context, {ChitMember? member}) {
  Navigator.of(context).push(MaterialPageRoute<void>(
    builder: (_) => AddPaymentScreen(initialMember: member),
  ));
}

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) => StreamBuilder<List<ChitMember>>(
        stream: _repository.watchMembers(),
        builder: (context, memberSnapshot) {
          if (memberSnapshot.hasError) return _ErrorView(memberSnapshot.error!);
          if (!memberSnapshot.hasData) return const _LoadingView();
          final members = memberSnapshot.data!;
          return StreamBuilder<List<ChitPayment>>(
            stream: _repository.watchPayments(),
            builder: (context, paymentSnapshot) {
              if (paymentSnapshot.hasError) return _ErrorView(paymentSnapshot.error!);
              if (!paymentSnapshot.hasData) return const _LoadingView();
              final now = DateTime.now();
              final thisMonth = paymentSnapshot.data!
                  .where((item) => item.paymentDate.year == now.year &&
                      item.paymentDate.month == now.month)
                  .toList();
              final active = members.where((item) => item.active).toList();
              final expected = active
                  .where((item) => scheduledInMonth(item, now))
                  .fold<int>(0, (sum, item) => sum + item.installmentPaise);
              final collected =
                  thisMonth.fold<int>(0, (sum, item) => sum + item.receivedPaise);
              final monthKey = _month.format(DateTime(now.year, now.month));
              final allocatedToMonth = paymentSnapshot.data!
                  .where((item) => item.installmentMonth == monthKey)
                  .fold<int>(0, (sum, item) => sum + item.receivedPaise);
              final online = thisMonth
                  .where((item) => item.mode == PaymentMode.online)
                  .fold<int>(0, (sum, item) => sum + item.receivedPaise);
              final offline = collected - online;
              final pending = expected > allocatedToMonth
                  ? expected - allocatedToMonth
                  : 0;
              return ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                children: [
                  Text(DateFormat('MMMM yyyy').format(now),
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _MetricCard(label: 'Active members', value: '${active.length}', icon: Icons.people),
                      _MetricCard(label: 'Expected this month', value: money(expected), icon: Icons.flag_outlined),
                      _MetricCard(label: 'Collected this month', value: money(collected), icon: Icons.check_circle_outline),
                      _MetricCard(label: 'Pending this month', value: money(pending), icon: Icons.hourglass_bottom),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Collection mix', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 14),
                          _CollectionBar(online: online, offline: offline),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Online  ${money(online)}'),
                              Text('Offline  ${money(offline)}'),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Recent transactions',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 6),
                          if (paymentSnapshot.data!.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 18),
                              child: Text('Payments you record will appear here.'),
                            )
                          else
                            ...paymentSnapshot.data!.take(5).map(
                                  (payment) => _PaymentTile(payment: payment),
                                ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      );
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: (MediaQuery.sizeOf(context).width - 44) / 2,
        child: Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(15),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 12),
                Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(label, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ),
      );
}

class _CollectionBar extends StatelessWidget {
  const _CollectionBar({required this.online, required this.offline});
  final int online;
  final int offline;

  @override
  Widget build(BuildContext context) {
    final total = online + offline;
    final onlineFraction = total == 0 ? 0.0 : online / total;
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: 12,
        child: Row(children: [
          Expanded(flex: (onlineFraction * 1000).round().clamp(1, 1000).toInt(), child: Container(color: Theme.of(context).colorScheme.primary)),
          Expanded(flex: ((1 - onlineFraction) * 1000).round().clamp(1, 1000).toInt(), child: Container(color: Theme.of(context).colorScheme.tertiaryContainer)),
        ]),
      ),
    );
  }
}

class MembersScreen extends StatefulWidget {
  const MembersScreen({super.key});

  @override
  State<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends State<MembersScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search members by name or phone',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (value) => setState(() => _query = value.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: StreamBuilder<List<ChitMember>>(
              stream: _repository.watchMembers(),
              builder: (context, snapshot) {
                if (snapshot.hasError) return _ErrorView(snapshot.error!);
                if (!snapshot.hasData) return const _LoadingView();
                final members = snapshot.data!
                    .where((member) => member.name.toLowerCase().contains(_query) ||
                        member.phone.contains(_query) ||
                        member.group.toLowerCase().contains(_query))
                    .toList();
                if (members.isEmpty) {
                  return const Center(child: Text('No members yet. Add your first member.'));
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 92),
                  itemCount: members.length,
                  itemBuilder: (context, index) {
                    final member = members[index];
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(child: Text(member.name.isEmpty ? '?' : member.name[0].toUpperCase())),
                        title: Text(member.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${member.phone}  •  ${member.group}\n${money(member.installmentPaise)} / month'),
                        isThreeLine: true,
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) => MemberDetailScreen(member: member),
                          ),
                        ),
                        trailing: PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'edit') {
                              Navigator.push(context, MaterialPageRoute<void>(
                                builder: (_) => MemberFormScreen(member: member),
                              ));
                            } else {
                              _openPayment(context, member: member);
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'edit', child: Text('Edit member')),
                            PopupMenuItem(value: 'payment', child: Text('Record payment')),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      );
}

class MemberFormScreen extends StatefulWidget {
  const MemberFormScreen({super.key, this.member});
  final ChitMember? member;

  @override
  State<MemberFormScreen> createState() => _MemberFormScreenState();
}

class _MemberFormScreenState extends State<MemberFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.member?.name);
  late final _phone = TextEditingController(text: widget.member?.phone);
  late final _group = TextEditingController(text: widget.member?.group);
  late final _amount = TextEditingController(
      text: widget.member == null ? '' : rupeesInput(widget.member!.installmentPaise));
  late final _duration = TextEditingController(text: '${widget.member?.durationMonths ?? 12}');
  late final _dueDay = TextEditingController(text: '${widget.member?.dueDay ?? 1}');
  late final _address = TextEditingController(text: widget.member?.address);
  late DateTime _start = widget.member?.startDate ?? DateTime.now();
  bool _active = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _active = widget.member?.active ?? true;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final member = ChitMember(
        id: widget.member?.id ?? '',
        name: _name.text,
        phone: _phone.text,
        group: _group.text,
        installmentPaise: paiseFromInput(_amount.text)!,
        startDate: _start,
        durationMonths: int.parse(_duration.text),
        dueDay: int.parse(_dueDay.text),
        active: widget.member == null ? true : _active,
        address: _address.text,
      );
      await _repository.saveMember(member);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(error))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.member == null ? 'Add member' : 'Edit member')),
        body: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _input(_name, 'Full name'),
              _input(_phone, 'Mobile number', type: TextInputType.phone),
              _input(_group, 'Chit group / scheme'),
              _input(_amount, 'Monthly installment (₹)', type: const TextInputType.numberWithOptions(decimal: true)),
              _input(_duration, 'Duration (months)', type: TextInputType.number),
              _input(_dueDay, 'Due day of month (1–28)', type: TextInputType.number),
              TextFormField(
                controller: _address,
                decoration: const InputDecoration(labelText: 'Address (optional)'),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Chit start date'),
                subtitle: Text(_date.format(_start)),
                trailing: const Icon(Icons.calendar_month),
                onTap: () async {
                  final selected = await showDatePicker(
                    context: context,
                    initialDate: _start,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (selected != null) setState(() => _start = selected);
                },
              ),
              if (widget.member != null)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Active member'),
                  value: _active,
                  onChanged: (value) => setState(() => _active = value),
                ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? 'Saving…' : 'Save member'),
              ),
            ],
          ),
        ),
      );

  Widget _input(TextEditingController controller, String label,
          {TextInputType? type}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: controller,
          keyboardType: type,
          decoration: InputDecoration(labelText: label),
          validator: (value) {
            if ((value ?? '').trim().isEmpty) return 'Required';
            if (label.contains('Monthly')) {
              final amount = paiseFromInput(value!);
              if (amount == null || amount <= 0) return 'Enter a valid amount (up to 2 decimals)';
            }
            if (label.contains('Duration')) {
              final duration = int.tryParse(value!);
              if (duration == null || duration < 1 || duration > 600) return 'Enter 1 to 600 months';
            }
            if (label.contains('Due day')) {
              final day = int.tryParse(value!);
              if (day == null || day < 1 || day > 28) return 'Enter a day from 1 to 28';
            }
            return null;
          },
        ),
      );
}

class AddPaymentScreen extends StatefulWidget {
  const AddPaymentScreen({super.key, this.initialMember});
  final ChitMember? initialMember;

  @override
  State<AddPaymentScreen> createState() => _AddPaymentScreenState();
}

class _AddPaymentScreenState extends State<AddPaymentScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _note = TextEditingController();
  ChitMember? _member;
  PaymentMode _mode = PaymentMode.cash;
  DateTime _paymentDate = DateTime.now();
  DateTime _installment = DateTime(DateTime.now().year, DateTime.now().month);
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _member = widget.initialMember;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _member == null) return;
    setState(() => _saving = true);
    try {
      await _repository.recordPayment(
        member: _member!,
        paymentDate: _paymentDate,
        installmentMonth: _month.format(_installment),
        receivedPaise: paiseFromInput(_amount.text)!,
        mode: _mode,
        reference: _reference.text,
        note: _note.text,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment recorded and receipt generated.')));
        Navigator.pop(context);
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(error))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Record payment')),
        body: StreamBuilder<List<ChitMember>>(
          stream: _repository.watchMembers(),
          builder: (context, snapshot) {
            if (snapshot.hasError) return _ErrorView(snapshot.error!);
            if (!snapshot.hasData) return const _LoadingView();
            final members = snapshot.data!.where((item) => item.active).toList();
            if (_member != null) {
              final selectedId = _member!.id;
              final match = members.where((item) => item.id == selectedId);
              _member = match.isEmpty ? null : match.first;
            }
            return Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  DropdownButtonFormField<ChitMember>(
                    value: _member,
                    decoration: const InputDecoration(labelText: 'Member'),
                    items: members
                        .map((item) => DropdownMenuItem(
                              value: item,
                              child: Text('${item.name} • ${item.group}', overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (value) => setState(() => _member = value),
                    validator: (value) => value == null ? 'Select a member' : null,
                  ),
                  const SizedBox(height: 12),
                  _dateField('Payment date', _paymentDate, (value) => setState(() => _paymentDate = value)),
                  _dateField('Installment month', _installment, (value) => setState(() => _installment = DateTime(value.year, value.month)), monthOnly: true),
                  TextFormField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      labelText: 'Amount received (₹)',
                      helperText: _member == null ? 'Choose a member to see the due amount.' : 'Monthly due: ${money(_member!.installmentPaise)}',
                    ),
                    validator: (value) {
                      final amount = paiseFromInput(value ?? '');
                      if (amount == null || amount <= 0) return 'Enter a valid positive amount (up to 2 decimals)';
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<PaymentMode>(
                    value: _mode,
                    decoration: const InputDecoration(labelText: 'Payment mode'),
                    items: const [
                      DropdownMenuItem(value: PaymentMode.online, child: Text('Online (UPI / bank transfer)')),
                      DropdownMenuItem(value: PaymentMode.cash, child: Text('Cash')),
                      DropdownMenuItem(value: PaymentMode.cheque, child: Text('Cheque')),
                    ],
                    onChanged: (value) => setState(() => _mode = value ?? PaymentMode.cash),
                  ),
                  if (_mode == PaymentMode.online)
                    _textInput(_reference, 'Online reference / UPI ID (optional)'),
                  if (_mode == PaymentMode.cheque)
                    _textInput(_reference, 'Cheque number / bank (optional)'),
                  _textInput(_note, 'Notes (optional)', lines: 2),
                  const SizedBox(height: 8),
                  const Text(
                    'Only the amount entered here is recorded as received. A reference number alone never confirms collection.',
                    style: TextStyle(color: Colors.black54),
                  ),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.verified_outlined),
                    label: Text(_saving ? 'Saving…' : 'Confirm received payment'),
                  ),
                ],
              ),
            );
          },
        ),
      );

  Widget _dateField(String label, DateTime value, ValueChanged<DateTime> change,
          {bool monthOnly = false}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: ListTile(
          tileColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          title: Text(label),
          subtitle: Text(monthOnly ? DateFormat('MMMM yyyy').format(value) : _date.format(value)),
          trailing: const Icon(Icons.calendar_month),
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: value,
              firstDate: DateTime(2000),
              lastDate: DateTime(2100),
            );
            if (picked != null) change(picked);
          },
        ),
      );

  Widget _textInput(TextEditingController controller, String label, {int lines = 1}) =>
      Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TextFormField(
          controller: controller,
          maxLines: lines,
          decoration: InputDecoration(labelText: label),
        ),
      );
}

class MemberDetailScreen extends StatelessWidget {
  const MemberDetailScreen({super.key, required this.member});
  final ChitMember member;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(member.name),
          actions: [
            IconButton(
              tooltip: 'Edit member',
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => MemberFormScreen(member: member),
                ),
              ),
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              tooltip: 'Record payment',
              onPressed: () => _openPayment(context, member: member),
              icon: const Icon(Icons.add_card),
            ),
          ],
        ),
        body: StreamBuilder<List<ChitPayment>>(
          stream: _repository.watchPayments(),
          builder: (context, snapshot) {
            if (snapshot.hasError) return _ErrorView(snapshot.error!);
            if (!snapshot.hasData) return const _LoadingView();
            final payments = snapshot.data!
                .where((item) => item.memberId == member.id)
                .toList();
            final received = payments.fold<int>(
                0, (sum, item) => sum + item.receivedPaise);
            final pending = member.scheduledPaise > received
                ? member.scheduledPaise - received
                : 0;
            final totalsByMonth = <String, int>{};
            for (final payment in payments) {
              totalsByMonth.update(
                payment.installmentMonth,
                (value) => value + payment.receivedPaise,
                ifAbsent: () => payment.receivedPaise,
              );
            }
            final fullyPaid = totalsByMonth.values
                .where((amount) => amount >= member.installmentPaise)
                .length;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(member.group,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Text('Member ID: ${member.id}'),
                        Text('Mobile: ${member.phone}'),
                        if (member.address.isNotEmpty) Text('Address: ${member.address}'),
                        Text('Start date: ${_date.format(member.startDate)}'),
                        Text('Monthly installment: ${money(member.installmentPaise)}'),
                        Text('Status: ${member.active ? 'Active' : 'Inactive'}'),
                      ],
                    ),
                  ),
                ),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _MetricCard(label: 'Scheduled', value: money(member.scheduledPaise), icon: Icons.event_note),
                    _MetricCard(label: 'Collected', value: money(received), icon: Icons.check_circle_outline),
                    _MetricCard(label: 'Outstanding', value: money(pending), icon: Icons.hourglass_bottom),
                    _MetricCard(label: 'Fully paid months', value: '$fullyPaid / ${member.durationMonths}', icon: Icons.calendar_month),
                  ],
                ),
                const SizedBox(height: 16),
                Text('Payment history', style: Theme.of(context).textTheme.titleLarge),
                if (payments.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Text('No payments recorded for this member.'),
                  )
                else
                  ...payments.map((payment) => _PaymentTile(payment: payment)),
              ],
            );
          },
        ),
      );
}

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  DateTime _monthValue = DateTime.now();
  String _query = '';
  String _filter = 'All';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _monthValue,
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                        initialDatePickerMode: DatePickerMode.year,
                      );
                      if (picked != null) setState(() => _monthValue = DateTime(picked.year, picked.month));
                    },
                    icon: const Icon(Icons.calendar_month),
                    label: Text(DateFormat('MMMM yyyy').format(_monthValue)),
                  ),
                ),
                const SizedBox(width: 8),
                DropdownButton<String>(
                  value: _filter,
                  items: const ['All', 'Online', 'Offline'].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                  onChanged: (value) => setState(() => _filter = value ?? 'All'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Search member or group', prefixIcon: Icon(Icons.search)),
              onChanged: (value) => setState(() => _query = value.toLowerCase().trim()),
            ),
          ),
          Expanded(
            child: StreamBuilder<List<ChitPayment>>(
              stream: _repository.watchPayments(),
              builder: (context, snapshot) {
                if (snapshot.hasError) return _ErrorView(snapshot.error!);
                if (!snapshot.hasData) return const _LoadingView();
                final items = snapshot.data!.where((item) {
                  final matchesMonth = item.paymentDate.year == _monthValue.year && item.paymentDate.month == _monthValue.month;
                  final matchesQuery = item.memberName.toLowerCase().contains(_query) || item.group.toLowerCase().contains(_query);
                  final matchesMode = _filter == 'All' ||
                      (_filter == 'Online' && item.mode == PaymentMode.online) ||
                      (_filter == 'Offline' && item.mode != PaymentMode.online);
                  return matchesMonth && matchesQuery && matchesMode;
                }).toList();
                final total = items.fold<int>(0, (sum, item) => sum + item.receivedPaise);
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Text('${items.length} payments'),
                        Text('Collected: ${money(total)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ]),
                    ),
                    Expanded(
                      child: items.isEmpty
                          ? const Center(child: Text('No payments recorded for this month.'))
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 20),
                              itemCount: items.length,
                              itemBuilder: (_, index) => _PaymentTile(payment: items[index]),
                            ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      );
}

class UpcomingScreen extends StatelessWidget {
  const UpcomingScreen({super.key});

  @override
  Widget build(BuildContext context) => StreamBuilder<List<ChitMember>>(
        stream: _repository.watchMembers(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return _ErrorView(snapshot.error!);
          if (!snapshot.hasData) return const _LoadingView();
          final now = DateTime.now();
          final active = snapshot.data!.where((item) => item.active).toList();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Projected monthly schedule', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              const Text('Projections are scheduled amounts, not money received.'),
              const SizedBox(height: 12),
              for (var offset = 0; offset < 12; offset++)
                Builder(builder: (context) {
                  final month = DateTime(now.year, now.month + offset, 1);
                  final scheduled = active
                      .where((member) => scheduledInMonth(member, month))
                      .toList();
                  final total = scheduled.fold<int>(0, (sum, member) => sum + member.installmentPaise);
                  return Card(
                    child: ExpansionTile(
                      title: Text(DateFormat('MMMM yyyy').format(month)),
                      subtitle: Text('${scheduled.length} expected installments • ${money(total)} projected'),
                      children: [
                        if (scheduled.isEmpty)
                          const ListTile(title: Text('No scheduled installments'))
                        else
                          ...scheduled.map((member) {
                            final day = member.dueDay.clamp(1, 28);
                            final due = DateTime(month.year, month.month, day);
                            return ListTile(
                              title: Text(member.name),
                              subtitle: Text('${member.group} • Due ${_date.format(due)}'),
                              trailing: Text(money(member.installmentPaise)),
                              onTap: () => _openPayment(context, member: member),
                            );
                          }),
                      ],
                    ),
                  );
                }),
            ],
          );
        },
      );
}

class ReportsScreen extends StatelessWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context) => StreamBuilder<List<ChitPayment>>(
        stream: _repository.watchPayments(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return _ErrorView(snapshot.error!);
          if (!snapshot.hasData) return const _LoadingView();
          final payments = snapshot.data!;
          final now = DateTime.now();
          final monthItems = payments.where((item) =>
              item.paymentDate.year == now.year && item.paymentDate.month == now.month);
          final total = monthItems.fold<int>(0, (sum, item) => sum + item.receivedPaise);
          final cash = monthItems
              .where((item) => item.mode == PaymentMode.cash)
              .fold<int>(0, (sum, item) => sum + item.receivedPaise);
          final cheque = monthItems
              .where((item) => item.mode == PaymentMode.cheque)
              .fold<int>(0, (sum, item) => sum + item.receivedPaise);
          final online = monthItems
              .where((item) => item.mode == PaymentMode.online)
              .fold<int>(0, (sum, item) => sum + item.receivedPaise);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Business summary', style: Theme.of(context).textTheme.titleLarge),
              Text(DateFormat('MMMM yyyy').format(now)),
              const SizedBox(height: 16),
              _ReportRow(label: 'Total collections', amount: total),
              _ReportRow(label: 'Online collection', amount: online),
              _ReportRow(label: 'Cash collection', amount: cash),
              _ReportRow(label: 'Cheque collection', amount: cheque),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Recorded payments', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text('Historical totals are based on payment date. Detailed CSV/PDF export and configurable date ranges are not enabled in this initial release.'),
                      const SizedBox(height: 12),
                      Text('All time recorded: ${money(payments.fold<int>(0, (sum, item) => sum + item.receivedPaise))}'),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      );
}

class _ReportRow extends StatelessWidget {
  const _ReportRow({required this.label, required this.amount});
  final String label;
  final int amount;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(title: Text(label), trailing: Text(money(amount), style: const TextStyle(fontWeight: FontWeight.bold))),
      );
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment});
  final ChitPayment payment;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            child: Icon(payment.mode == PaymentMode.online ? Icons.account_balance : payment.mode == PaymentMode.cash ? Icons.payments_outlined : Icons.receipt_outlined),
          ),
          title: Text(payment.memberName, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text('${_date.format(payment.paymentDate)} • ${payment.receiptNumber}\n${payment.installmentMonth} • ${payment.mode.name.toUpperCase()}'),
          isThreeLine: true,
          trailing: Text(money(payment.receivedPaise), style: const TextStyle(fontWeight: FontWeight.bold)),
          onTap: () => showDialog<void>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Payment receipt'),
              content: Text(
                'Receipt: ${payment.receiptNumber}\nMember: ${payment.memberName}\nInstallment: ${payment.installmentMonth}\nDate: ${_date.format(payment.paymentDate)}\nReceived: ${money(payment.receivedPaise)}\nMode: ${payment.mode.name}\nReference: ${payment.reference.isEmpty ? '—' : payment.reference}\nStatus: ${payment.status.name}',
              ),
              actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
            ),
          ),
        ),
      );
}

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) => const Center(child: CircularProgressIndicator());
}

class _ErrorView extends StatelessWidget {
  const _ErrorView(this.error);
  final Object error;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Could not load data.\n${errorText(error)}', textAlign: TextAlign.center),
        ),
      );
}
