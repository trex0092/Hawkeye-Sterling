// React 19 @types/react moved the JSX namespace from the global scope to
// React.JSX. Files that return JSX.Element without importing React break
// with TS2503. This declaration restores the global JSX namespace so all
// existing code continues to typecheck without modification.
import type React from "react";

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<
      C,
      P
    >;
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    interface IntrinsicClassAttributes<T>
      extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}
