import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'screens.dart';

class ChitManagerApp extends StatelessWidget {
  const ChitManagerApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Chit Manager',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF176B5B),
            surface: const Color(0xFFF7F9F8),
          ),
          scaffoldBackgroundColor: const Color(0xFFF7F9F8),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFFF7F9F8),
            centerTitle: false,
          ),
          inputDecorationTheme: InputDecorationTheme(
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            filled: true,
            fillColor: Colors.white,
          ),
        ),
        home: StreamBuilder<User?>(
          stream: FirebaseAuth.instance.authStateChanges(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            return snapshot.data == null
                ? const SignInScreen()
                : const HomeShell();
          },
        ),
      );
}
