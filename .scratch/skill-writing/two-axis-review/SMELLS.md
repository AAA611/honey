# Smell baseline

Fowler code smells (_Refactoring_, ch.3) applied to the **diff**, not the whole codebase. Each entry: *what it is* → *how to fix*.

Match against changed hunks only. Always a **judgement call**. Repo-documented standards override this list.

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename; if no honest name comes, the design is murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together. → bundle into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → polymorphism, or one shared map.
- **Shotgun Surgery** — one logical change forces scattered edits across many files. → gather what changes together into one module.
- **Divergent Change** — one file/module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks for needs the spec doesn't have. → delete; inline until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates. → cut it; call the real target.
- **Refused Bequest** — a subclass/implementer that ignores or overrides most of what it inherits. → drop inheritance; use composition.
