const libclang = require('libclang');

module.exports = function(filename) {
    const idx = new libclang.Index();

    const tu = libclang.TranslationUnit.fromSource(idx, filename, ['-Xclang', '-fsyntax-only', '-std=c++11']);

    const cData = {
        Functions: []
    };

    tu.cursor.visitChildren(function(parent) {
        const cursor = this;

        switch (cursor.kind) {
            case libclang.Cursor.FunctionDecl:
            case libclang.Cursor.ObjCInstanceMethodDecl:
                const returnType = cursor.type.spelling.replace(/ ?\([^\(]+$/, '');
                const funcName = cursor.spelling;

                const params = [];

                cursor.visitChildren(function(parent) {
                    const cursor = this;

                    if (cursor.kind === libclang.Cursor.ParmDecl) {
                        const paramName = cursor.spelling;

                        const type = cursor.type;
                        let paramType = getKindName(cursor.type.kind);

                        if (type.kind === libclang.Type.Typedef || type.kind === libclang.Type.Pointer) {
                            paramType = cursor.type.spelling;
                        }

                        params.push({ name: paramName, type: paramType });
                    }

                    return libclang.Cursor.Continue;
                });

                cData.Functions.push({
                    Name: funcName,
                    Return: returnType,
                    Parameters: params
                });

                return libclang.Cursor.Continue;
        }

        return libclang.Cursor.Recurse;

        function getKindName(kind) {
            switch (kind) {
                case libclang.Type.Invalid:
                    return "Invalid";
                case libclang.Type.Unexposed:
                    return "Unexposed";
                case libclang.Type.Void:
                    return "void";
                case libclang.Type.Bool:
                    return "bool";
                case libclang.Type.Char_U:
                    return "char_t";
                case libclang.Type.UChar:
                    return "uchar_t";
                case libclang.Type.Char16:
                    return "uint16_t";
                case libclang.Type.Char32:
                    return "uint32_t";
                case libclang.Type.UInt:
                    return "uint";
                case libclang.Type.ULong:
                    return "ulong";
                case libclang.Type.ULongLong:
                    return "ulonglong";
                case libclang.Type.UInt128:
                    return "uint128_t";
                case libclang.Type.Char_S:
                    return "char";
                case libclang.Type.SChar:
                    return "SChar";
                case libclang.Type.WChar:
                    return "wchar_t";
                case libclang.Type.Short:
                    return "short";
                case libclang.Type.Int:
                    return "int";
                case libclang.Type.Long:
                    return "long";
                case libclang.Type.LongLong:
                    return "longlong";
                case libclang.Type.Int128:
                    return "int128_t";
                case libclang.Type.Float:
                    return "float";
                case libclang.Type.Double:
                    return "double";
                case libclang.Type.LongDouble:
                    return "longdouble";
                case libclang.Type.NullPtr:
                    return "nullptr";
                case libclang.Type.Overload:
                    return "Overload";
                case libclang.Type.Dependent:
                    return "Dependent";
                case libclang.Type.ObjCId:
                    return "ObjCId";
                case libclang.Type.ObjCClass:
                    return "ObjCClass";
                case libclang.Type.ObjCSel:
                    return "ObjCSel";
                case libclang.Type.Float128:
                    return "float128";
                case libclang.Type.Complex:
                    return "complex";
                case libclang.Type.Pointer:
                    return "pointer";
                case libclang.Type.BlockPointer:
                    return "block-pointer";
                case libclang.Type.LValueReference:
                    return "lvalue-reference";
                case libclang.Type.RValueReference:
                    return "rvalue-reference";
                case libclang.Type.Record:
                    return "record";
                case libclang.Type.Enum:
                    return "enum";
                case libclang.Type.Typedef:
                    return "typedef";
                case libclang.Type.ObjCInterface:
                    return "obj-c-interface";
                case libclang.Type.ObjCObjectPointer:
                    return "obj-c-object-pointer";
                case libclang.Type.FunctionNoProto:
                    return "function-no-proto";
                case libclang.Type.FunctionProto:
                    return "function-proto";
                case libclang.Type.ConstantArray:
                    return "const-array";
                case libclang.Type.Vector:
                    return "vector";
                case libclang.Type.IncompleteArray:
                    return "incomplete-array";
                case libclang.Type.VariableArray:
                    return "variable-array";
                case libclang.Type.DependentSizedArray:
                    return "dependent-sized-array";
                case libclang.Type.MemberPointer:
                    return "member-pointer";
                case libclang.Type.Auto:
                    return "auto";
                case libclang.Type.Elaborated:
                    return "elaborated";
            }
        }
    });

    return cData;
};