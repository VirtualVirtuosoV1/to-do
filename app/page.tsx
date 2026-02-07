"use client";

import { useEffect, useState, FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type Todo = {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
};

export default function HomePage() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Todos state
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);

  // On first load, check if user is already logged in
  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.warn("Error getting user", error.message);
      }

      setUser(user ?? null);
    };

    loadUser();

    // Optionally, listen to auth changes (login/logout from other tabs)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // When user changes, load their todos
  useEffect(() => {
    if (!user) {
      setTodos([]);
      return;
    }

    const fetchTodos = async () => {
      setTodosLoading(true);
      setTodosError(null);

      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading todos", error);
        setTodosError(error.message);
      } else {
        setTodos(data as Todo[]);
      }

      setTodosLoading(false);
    };

    fetchTodos();
  }, [user]);

  // ---- Auth handlers ----

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });

    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    // If email confirmations are enabled, user may need to confirm via email
    // before being "fully" logged in.
    setUser(data.user ?? null);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setUser(data.user ?? null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setTodos([]);
    setNewTodo("");
  }

  // ---- Todos handlers ----

  async function handleAddTodo(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmed = newTodo.trim();
    if (!trimmed) return;

    // Optimistic update: update UI first
    const tempId = Date.now();
    const optimisticTodo: Todo = {
      id: tempId,
      title: trimmed,
      done: false,
      created_at: new Date().toISOString(),
    };
    setTodos((prev) => [optimisticTodo, ...prev]);
    setNewTodo("");

    const { data, error } = await supabase
      .from("todos")
      .insert({ title: trimmed, user_id: user.id })
      .select()
      .single();

    if (error) {
      console.error("Error inserting todo", error);
      // Roll back optimistic update
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
      return;
    }

    // Replace the optimistic item with the real one from DB
    setTodos((prev) => [
      data as Todo,
      ...prev.filter((t) => t.id !== tempId),
    ]);
  }

  async function toggleTodoDone(todo: Todo) {
    if (!user) return;

    const newDone = !todo.done;

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, done: newDone } : t))
    );

    const { error } = await supabase
      .from("todos")
      .update({ done: newDone })
      .eq("id", todo.id);

    if (error) {
      console.error("Error updating todo", error);
      // Roll back UI if needed
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t))
      );
    }
  }

  async function deleteTodo(id: number) {
    if (!user) return;

    const prev = todos;
    setTodos((current) => current.filter((t) => t.id !== id));

    const { error } = await supabase.from("todos").delete().eq("id", id);

    if (error) {
      console.error("Error deleting todo", error);
      setTodos(prev); // rollback
    }
  }

  // ---- UI ----

  // Not logged in: show auth card
  if (!user) {
    return (
      <main className="page">
        <div className="todo-card">
          <header className="todo-header">
            <h1 className="title">To-Do App</h1>
            <p className="subtitle">
              Sign {isSignUpMode ? "up" : "in"} to save your tasks.
            </p>
          </header>

          <form
            onSubmit={isSignUpMode ? handleSignUp : handleSignIn}
            className="add-form"
          >
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="add-input"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="add-input"
              required
            />
            <button type="submit" className="add-button" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : isSignUpMode
                ? "Sign up"
                : "Sign in"}
            </button>
          </form>

          {authError && <p className="empty">{authError}</p>}

          <p className="hint">
            {isSignUpMode ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="logout-button"
              onClick={() => {
                setIsSignUpMode((v) => !v);
                setAuthError(null);
              }}
            >
              {isSignUpMode ? "Sign in instead" : "Create an account"}
            </button>
          </p>
        </div>
      </main>
    );
  }

  // Logged in: show todos
  return (
    <main className="page">
      <div className="todo-card">
        <header className="todo-header">
          <div className="header-row">
            <div>
              <h1 className="title">My To-Dos</h1>
              <p className="subtitle">
                Signed in as <strong>{user.email}</strong>
              </p>
            </div>
            <button className="logout-button" onClick={handleSignOut}>
              Log out
            </button>
          </div>
        </header>

        <form onSubmit={handleAddTodo} className="add-form">
          <input
            type="text"
            placeholder="Add a new task..."
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            className="add-input"
          />
          <button type="submit" className="add-button">
            Add
          </button>
        </form>

        {todosLoading && <p className="empty">Loading tasks...</p>}
        {todosError && (
          <p className="empty">Could not load todos: {todosError}</p>
        )}

        {!todosLoading && !todosError && todos.length === 0 && (
          <p className="empty">No tasks yet. Add your first one! ✨</p>
        )}

        {todos.length > 0 && (
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id} className="todo-item">
                <label className="todo-left">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleTodoDone(todo)}
                  />
                  <span className={`todo-title ${todo.done ? "done" : ""}`}>
                    {todo.title}
                  </span>
                </label>
                <button
                  className="delete-button"
                  onClick={() => deleteTodo(todo.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
